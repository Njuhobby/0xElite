# RFC-009: User-initiated Transaction Orchestration

| Field    | Value                                                  |
|----------|--------------------------------------------------------|
| RFC      | 009                                                    |
| Title    | User-initiated Transaction Orchestration               |
| Author   | 0xElite Team                                           |
| Status   | Accepted                                               |
| Created  | 2026-05-04                                             |
| Updated  | 2026-05-04                                             |

---

## 1. Context

The platform routinely needs to write to the chain in response to user actions: client creates a project, client deposits escrow, client approves a milestone, dev marks a milestone complete, party raises a dispute, voter casts a vote, admin owner-resolves, etc. Each of these has two side effects we care about:

1. **A chain transition** — funds move, status flips, an event fires.
2. **An off-chain mirror** — the DB row that drives the dashboard UI must reflect the new state, and we may need to send notifications.

Without a disciplined pattern, every touchpoint reinvents its own way of bridging the two. Early in the codebase that's exactly what happened: some flows had the user sign in their wallet and POST a tx hash to the backend; others had the backend's own wallet sign and `await tx.wait()` inline inside the request handler. The two paths drifted enough to cause real bugs:

- The dev's "Mark as Complete" went through `PUT /api/milestones/:id`, which then did an inline backend-signed `updateMilestoneStatus` and `await tx.wait()`. If that on-chain call failed, the DB had already been UPDATEd to `pending_review` — silent drift.
- That same path took 1 confirmation by default. A reorg of depth 1 would invalidate the receipt while the DB stayed flipped.
- There was no retry mechanism. The catch block logged "can be retried" but nothing actually retried.
- The user doesn't sign their own intent — the backend acts as a custodial relayer for what should be a self-evident action ("I'm reporting my own progress").

We needed a single coherent orchestration model.

---

## 2. Problem Statement

Define one architecture for **every** user-driven write to the chain such that:

- The user signs their own action with their own wallet (no backend custody for things the user can do themselves).
- DB state never moves ahead of confirmed chain state.
- Reorgs, reverts, and abandoned tabs all converge to a consistent final state.
- The same handler runs whether the frontend successfully closed the loop or whether a backend sweeper had to clean up.

Separately, the platform also needs **backend-keeper** writes — actions no user can or should sign (`startVoting` after evidence deadline, `executeResolution` after voting deadline). Those need a parallel but distinct path.

---

## 3. Options Considered

### Option A: Inline `await tx.wait()` in the request handler

```ts
// What we had:
await db.query('UPDATE milestones SET status = $1 WHERE id = $2', ['pending_review', id]);
const tx = await projectManager.updateMilestoneStatus(...);
await tx.wait();  // 1 confirmation default
```

- **Pros**: Trivially simple. One request, one response, one path.
- **Cons**:
  - DB writes happen *before* chain confirmation. Tx revert leaves DB drifted.
  - 1-confirmation `wait()` is reorg-vulnerable on real chains.
  - No retry on transient failure — the catch silently logs and walks away.
  - Backend wallet must be the signer, even when the user is the right semantic actor.
  - Doesn't compose with the keeper pattern (no shared infra for "wait, then update DB").

### Option B: User signs in wallet → POST tx hash → polling reconciler

```ts
// On the frontend:
const hash = await wagmi.writeContract(...)
await fetch('/api/transactions/pending', { method: 'POST', body: { txHash: hash, action, entityId, metadata } });
await useWaitForTransactionReceipt({ hash, confirmations: N });
await fetch(`/api/transactions/pending/${hash}`, { method: 'DELETE' });  // triggers handler

// Backend ConsistencyScheduler also runs:
// - Walk pending_transactions every N seconds
// - For each row: check on-chain receipt + N confirmations
// - On confirmed success → run handler in DB transaction → DELETE row
// - On revert → DELETE row, no DB mutation
// - On stale (>1h, never mined) → DELETE row, log warning
```

- **Pros**:
  - User signs their own intent.
  - DB row updates are gated on N confirmations — reorg-resistant.
  - Closed tab / browser crash is fine: scheduler catches abandoned tx hashes.
  - Single code path (the action handler) regardless of how the row reaches it.
  - Handler runs inside a DB transaction with the row lock, so it's atomic.
- **Cons**:
  - Two writes (POST + DELETE) per tx. One extra round-trip vs Option A.
  - Frontend has to remember to POST early; if it doesn't, only the scheduler catches it (~1 cycle delay).
  - Adds the `pending_transactions` table and the scheduler.

### Option C: Pure event-driven (ChainReconciler scans block ranges)

```ts
// Scan every new block range for relevant events, dispatch handler.
```

- **Pros**: Pure source-of-truth model — the chain is the only state.
- **Cons**:
  - High latency for the user — they wait for the next scan cycle (typically several seconds to a minute) before their action shows up.
  - Some handlers need pre-tx context that's not in the event (e.g. `handleCreateProject` needs the DB-side draft project to exist already so it can attach the contract project ID).
  - Lacks the "I clicked this just now, here's instant feedback" UX.

---

## 4. Decision

**Adopt Option B as the canonical pattern for user-initiated writes**, with **Option C as a fallback layer** for events the platform missed (frontend crashed before POST, third-party caller bypassing the UI). Option A is **prohibited** for new code; existing instances were migrated.

### 4.1 The shape of every user-initiated write

```
1. Frontend collects intent (which contract + function + args + entity + metadata).
2. Frontend calls wagmi.writeContract(...) → user signs → tx hash.
3. Frontend POSTs to /api/transactions/pending with:
     entityType, entityId, action, txHash, walletAddress, metadata
4. Frontend useWaitForTransactionReceipt with TX_CONFIRMATIONS confirmations.
5. On success → DELETE /api/transactions/pending/:txHash.
   The DELETE handler:
     a. SELECT ... FOR UPDATE the pending row in a DB transaction
     b. dispatch to processCompletedAction(client, row, provider, contracts)
     c. handler does its DB writes + emits notifications
     d. DELETE the pending row
     e. COMMIT
   If frontend doesn't reach step 5 (closed tab, network error), the
   ConsistencyScheduler does the same dance later.
```

### 4.2 The `pending_transactions` table

```
id (uuid, pk)
entity_type     -- e.g. 'project', 'dispute', 'developer'
entity_id       -- foreign-key-ish to that entity
action          -- string, dispatched on by processCompletedAction
tx_hash         -- unique, the on-chain tx
wallet_address  -- who signed
metadata        -- jsonb, action-specific extras (milestone index, etc.)
created_at
```

Single source of truth for "txes the platform expects but hasn't processed yet". It's a queue, not a log; rows DELETE on success, on revert, and on timeout.

### 4.3 Action dispatch (`pendingTxActions.ts`)

`processCompletedAction(client, row, provider, contracts)` is one big switch on `row.action`. Each case has its own handler:

- `create_project` — parse `ProjectCreated`, attach contract project ID to draft row
- `deposit_escrow` — flip project to `deposited`, kick off auto-assignment in `postCommit`
- `stake` — flip developer status to `staked`
- `approve_milestone` — credit dev, complete project if last milestone, sync xELITE
- `update_milestone_status` — flip milestone to `pending_review`, notify client
- `create_dispute` / `submit_evidence` / `start_voting` / `cast_vote` / `execute_resolution` / `owner_resolve` — dispute lifecycle (see RFC-011)

The handler returns an `ActionResult` with optional `postCommit` (best-effort cross-cutting work that runs after the DB transaction commits — notifications, on-chain side-effects like xELITE mint).

### 4.4 The ConsistencyScheduler

A long-running task in the backend with three concerns (today):

1. **`drainPendingTransactions`** — walks `pending_transactions`, checks each tx's receipt, runs the same handler the DELETE endpoint runs. Default interval 5s. Idempotent because handlers operate on fresh row state and the scheduler holds the row lock.
2. **`sweepVotingPowerDrift`** — finds developers whose `voting_power` (DB-derived from earnings × rating) doesn't match `elite_token_balance` (on-chain xELITE) and mints/burns to repair.
3. **`sweepEvidenceDeadlines` / `sweepOverdueDisputes`** — keeper sweeps for dispute lifecycle (see RFC-011).

Tasks 2 and 3+ are **backend-keeper** writes — the backend wallet signs because no user is the right semantic actor. They use inline `await tx.wait(N)` since they don't go through `pending_transactions` (no user side to coordinate with). The DB write that follows happens via `chainReconciler` picking up the resulting event, so we don't double-source DB truth.

### 4.5 The ChainReconciler

Independent of the user-initiated path. Periodically scans block ranges, parses configured events (`MilestoneApproved`, `VotingStarted`, `DisputeResolved`, `DisputeResolvedByOwner`, ...) and feeds them into `processCompletedAction` with a synthesized row (no `pending_transactions` entry needed). Two roles:

1. **Catch missed events**: if the frontend crashed between wallet sign and POST, the tx still landed but no one queued it. Reconciler picks it up.
2. **Catch keeper outputs**: when `sweepEvidenceDeadlines` calls `startVoting`, the resulting `VotingStarted` event becomes the handle by which `handleStartVoting` updates the DB row. The keeper itself doesn't write to the DB.

### 4.6 Reorg / revert / closed-tab semantics

| Scenario | Outcome |
|----------|---------|
| User signs, tab closes before POST | `chainReconciler` will pick up the event |
| User signs, POST succeeds, tab closes before DELETE | `drainPendingTransactions` will pick it up after N confirmations |
| Tx reverts | `drainPendingTransactions` deletes the pending row, no DB mutation |
| Tx mined but reorg drops it | After N confirmations the receipt is gone, scheduler treats as "not yet mined", retries up to PENDING_TX_TIMEOUT_MS (default 1h) |
| Tx never mined | After timeout, scheduler deletes the row and logs a warning |
| Concurrent DELETE + scheduler tick | Both `SELECT ... FOR UPDATE` so one waits; second one sees row gone (idempotent) |

`CONFIRMATIONS` is configurable (`process.env.CONFIRMATIONS`); local hardhat uses 0 or 1, production should set it to the chain's reorg-safety threshold.

---

## 5. Case Study: Mark-as-Complete migration

The cleanest illustration of why Option A failed and Option B works.

### Before

```ts
// frontend/src/components/project/MilestoneCard.tsx
async handleMarkComplete() {
  const sig = await signMessage(...)
  await fetch('/api/milestones/:id', { method: 'PUT', body: { status: 'pending_review', sig } });
}

// backend/src/api/routes/milestones.ts (PUT /:id)
await db.query("UPDATE milestones SET status='pending_review' ...");
await createNotification(client, ...);
const tx = await projectManager.updateMilestoneStatus(...);  // backend signs
await tx.wait();  // 1 confirmation
```

The backend was the on-chain caller because `updateMilestoneStatus` had `onlyOwner` modifier — the contract didn't permit the dev to sign their own progress report. That contract design, not any infrastructure constraint, was what forced the asymmetry.

### After

```solidity
// contracts/contracts/ProjectManager.sol
function updateMilestoneStatus(uint256 _projectId, uint8 _milestoneIndex, MilestoneStatus _newStatus) external {
  ...
  if (msg.sender != owner()) {
    // assigned developer can flip Pending/InProgress → PendingReview on their own milestone
    require(isAssignedDev(msg.sender), NotProjectDeveloper);
    require(_newStatus == MilestoneStatus.PendingReview, InvalidMilestoneStatus);
  }
  ...
}
```

```tsx
// frontend/src/components/project/MilestoneCard.tsx
async handleMarkComplete() {
  markOnChain({ functionName: 'updateMilestoneStatus', args: [...] });
  // wagmi useWriteContract → useEffect on hash → POST /api/transactions/pending
  // useWaitForTransactionReceipt → useEffect on success → DELETE /api/transactions/pending/:hash
}
```

```ts
// backend/src/services/pendingTxActions.ts
case 'update_milestone_status':
  result = await handleUpdateMilestoneStatus(client, row, provider, contracts.projectManager);
  break;
```

The backend `PUT /api/milestones/:id` route was deleted entirely. The `updateMilestoneStatus` contract permission was widened so the dev (the right semantic actor) signs. The dispatch goes through the same pending_tx pipeline as everything else.

The MilestoneCard also queries `/api/transactions/pending` on mount so a refresh during pending state still shows the correct "Submitting on-chain..." button state — no orphaned UI.

---

## 6. Consequences

- All user-driven writes converge on a single, auditable, reorg-safe path.
- New user-driven actions require: a wagmi call site, a `processCompletedAction` case, and (if needed) a frontend pending-tx awareness pattern. Adding one took ~80 lines for `update_milestone_status`.
- New backend-keeper actions require: a sweep task in `consistencyScheduler.ts` and an event handler in `chainReconciler.ts` (or reuse an existing one).
- The contract permission model is now explicit: anyone signing must be the right semantic actor for that function. We will not add `onlyOwner` modifiers as a shortcut to "let the backend handle it".
- The `pending_transactions` table is now load-bearing. Its retention behavior and the scheduler's confirmation threshold are operational levers.

---

## 7. Open Questions

- **Per-tx confirmation tuning**: today every action uses the same `CONFIRMATIONS` env var. High-value actions (escrow release) might warrant higher confidence than low-value ones (notifications). Defer until we move off local hardhat.
- **Backend-keeper failure path**: today keepers do inline `await tx.wait(N)` and just log on failure (e.g. `executeResolution` reverts because someone front-ran us). Could route keepers through `pending_transactions` too for retry semantics, but that would force every keeper to deal with an eventual-consistency UX. Defer until we have a real reorg incident or operational complaint.
- **`pending_transactions` retention**: rows with revert / timeout DELETE today. We may want an audit log of those for ops. Defer until we have ops complaints.

---

## 8. References

- Implementation: `backend/src/api/routes/transactions.ts`, `backend/src/services/pendingTxActions.ts`, `backend/src/services/consistencyScheduler.ts`, `backend/src/services/chainReconciler.ts`, `frontend/src/components/project/MilestoneCard.tsx`
- Schema: `backend/src/db/migrations/013_create_pending_transactions.sql`
- Related: RFC-001 (data sync strategy), RFC-008 (on-chain milestones), RFC-011 (dispute lifecycle)
