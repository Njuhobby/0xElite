# RFC-011: Dispute Lifecycle Keepers and Resolution Bookkeeping

| Field    | Value                                                  |
|----------|--------------------------------------------------------|
| RFC      | 011                                                    |
| Title    | Dispute Lifecycle Keepers and Resolution Bookkeeping   |
| Author   | 0xElite Team                                           |
| Status   | Accepted                                               |
| Created  | 2026-05-04                                             |
| Updated  | 2026-05-04                                             |

---

## 1. Context

RFC-003 specified the DAO arbitration system: a dispute opens with a 3-day evidence window, then a 3-day voting window where xELITE holders weigh in, then a resolution that pays out the remaining escrow.

This RFC documents the **operational** side that RFC-003 left underspecified: how state actually transitions between phases when no human user is the right actor to push the button, how DB rows get updated when the chain emits resolution events, and what bookkeeping needs to mirror the happy-path milestone bookkeeping when a project closes via dispute instead of via approval. It also captures the explicit decision to keep dispute granularity at the **project** level for MVP (despite the obvious limitation).

The on-chain lifecycle has three terminal-bound transitions:

1. `Open` → `Voting`: triggered by `startVoting()`, permissionless on the contract, but requires `block.timestamp >= evidenceDeadline`.
2. `Voting` → `Resolved`: triggered by `executeResolution()` (quorum met) or `ownerResolve()` (admin, only when quorum NOT met), both require `block.timestamp >= votingDeadline`.
3. `Voting` → `Resolved` via owner is a parallel exit, not a sequence after `executeResolution`.

The EVM has no cron. Without an external trigger, an open dispute past its evidence deadline simply sits forever. Same for a voting-phase dispute past its voting deadline.

---

## 2. Problem Statement

We need to answer:

1. **Who calls `startVoting`?** It's permissionless, but if we leave it to "anyone" we get nobody. The UX of "wait three days then a dispute might or might not progress" is broken.
2. **Who calls `executeResolution`?** Same shape, except this one *can* revert (`QuorumNotMet`) — so the keeper must check before submitting.
3. **What happens when quorum isn't met?** The contract has `ownerResolve(disputeId, clientWon)` as the admin escape hatch. How does the admin know they need to act?
4. **When the dispute resolves in the dev's favor, how do dashboards stay consistent?** `finalizeResolution` updated `disputes` and `projects` rows but missed `developers.projects_completed`, `developers.total_earned`, `clients.projects_completed`, `clients.total_spent`, and the remaining milestones (which kept showing "Awaiting Approval" forever).
5. **Should dispute granularity be project-level or milestone-level?** The current design freezes the entire escrow on dispute creation; resolution is winner-takes-all on the remaining balance. For projects with many milestones this is heavy-handed.

---

## 3. Options Considered

### 3.1 Keeper for `startVoting` and `executeResolution`

**Option A**: User-driven only — surface the action in UI as "Open Voting" / "Finalize", wait for someone (a party, a voter, an admin) to click it.

- **Pros**: No backend keeper, minimal infrastructure.
- **Cons**: Nobody is incentivized to click. Disputes stall. Bad UX for the parties whose escrow is frozen.

**Option B**: Backend acts as keeper. Periodic sweep finds disputes past their phase deadline and submits the appropriate tx.

- **Pros**: Disputes progress automatically. Owner/admin only intervenes when quorum fails. Aligns with how off-chain contracts often handle EVM cron gaps.
- **Cons**: Backend needs a funded wallet. Backend is now a load-bearing keeper — if it goes down, disputes stall (degraded but not broken; user-driven trigger still works as fallback).

**Option C**: Public bounty / Gelato-style decentralized keeper.

- **Pros**: Decentralized.
- **Cons**: Out of scope for MVP. We'd need to wrap each keeper call in a bounty contract or integrate with a third-party keeper network.

### 3.2 Quorum-not-met fallback

**Option D**: Auto-`ownerResolve` after voting deadline if quorum not met — backend picks a side.

- **Pros**: Fully automated.
- **Cons**: Backend can't pick a side responsibly. This is a human judgment call.

**Option E**: Notify admin once per such dispute, let them resolve via UI.

- **Pros**: Human in the loop where appropriate.
- **Cons**: Admin must actually act — but admin already exists for this kind of thing.

### 3.3 Resolution bookkeeping

**Option F**: Leave `finalizeResolution` minimal — DB stays drifted from "true" state until the next manual fix.

- **Pros**: Less code in the dispute path.
- **Cons**: Dashboards lie. `projects_completed` stays 0 for devs who completed projects via dispute, milestones show "Awaiting Approval" on completed projects, etc.

**Option G**: Mirror `handleApproveMilestone`'s terminal bookkeeping inside `finalizeResolution` for the dev-wins case. Bump counters, close out remaining milestones, credit `total_earned`.

- **Pros**: Dashboards stay correct.
- **Cons**: Same logic in two places, must stay in sync.

### 3.4 Dispute granularity

**Option H**: Keep project-level disputes (current design). Resolution = winner takes all of remaining escrow.

- **Pros**: Simple. Already implemented. Adequate for short projects.
- **Cons**: A long project with one disputed milestone freezes the entire engagement. Coarse blast radius.

**Option I**: Milestone-scoped disputes with concurrent independent resolution.

- **Pros**: Fine-grained. One bad milestone doesn't kill the engagement.
- **Cons**: Substantial contract + DB + UI changes. EscrowVault needs per-milestone freeze/release. Project state machine has to handle multiple parallel disputes plus continued execution.

**Option J**: Milestone-scoped disputes that terminate the project on first dispute.

- **Pros**: Finer than H, simpler than I.
- **Cons**: Still requires per-milestone tracking. Half the work of I.

**Option K**: Project-level with proportional resolution (e.g. 70/30 split).

- **Pros**: Less binary outcome.
- **Cons**: How do voters express a proportion? Complicates the voting model substantially.

---

## 4. Decision

### 4.1 Keepers — adopt B + E

Two new tasks in `consistencyScheduler.ts`:

- **`sweepEvidenceDeadlines`** (Task 3): finds disputes with `status='open' AND evidence_deadline < NOW() AND chain_dispute_id IS NOT NULL`. For each, re-checks the on-chain status (must still be `Open`) and calls `disputeDAO.startVoting(chainDisputeId)`. The chain emits `VotingStarted`, which `chainReconciler` picks up and feeds into `handleStartVoting` — so the keeper itself doesn't write to the DB.
- **`sweepOverdueDisputes`** (Task 4): finds disputes with `status='voting' AND voting_deadline < NOW() AND chain_dispute_id IS NOT NULL AND quorum_required IS NOT NULL`. For each:
  - **Quorum met** (`total_vote_weight >= quorum_required`): re-checks on-chain status, calls `disputeDAO.executeResolution(chainDisputeId)`. DB update flows through `chainReconciler` picking up `DisputeResolved`.
  - **Quorum NOT met**: stamps `disputes.owner_resolution_notified_at = NOW()` (idempotent — won't re-notify on subsequent ticks) and dispatches `dispute_owner_resolve_required` notifications to all admin addresses via `createNotificationBatch`. Admin then uses `OwnerResolvePanel` on the dispute detail page to call `ownerResolve(disputeId, clientWon)` from their wallet.

Both tasks use `await tx.wait(CONFIRMATIONS)` inline (they're keeper writes, not user-driven; no `pending_transactions` row needed — see RFC-009 §4.4). They're idempotent: a second tick that catches a dispute mid-resolution will see the on-chain status already past `Voting`/`Open` and skip.

Sweep intervals are env-configurable (`EVIDENCE_DEADLINE_SWEEP_INTERVAL`, `OVERDUE_DISPUTE_SWEEP_INTERVAL`); default 5 minutes.

### 4.2 Resolution bookkeeping — adopt G

`finalizeResolution` (called by both `handleExecuteResolution` and `handleOwnerResolve`) now does the full handoff to the post-project world when `clientWon === false`:

```
UPDATE developers SET
  projects_completed = projects_completed + 1,
  total_earned = total_earned + developerShare,
  availability = 'available',
  current_project_id = NULL
UPDATE clients SET
  projects_completed = projects_completed + 1,
  total_spent = total_spent + developerShare
UPDATE milestones SET status='completed', completed_at=NOW()
  WHERE project_id = $projectId AND status != 'completed'
```

The `validate_escrow_balance_for_milestone` trigger (which guarded "milestone status → completed must have escrow balance ≥ milestone budget") is dropped via migration 018, because:

1. The chain itself enforces escrow balance inside `approveMilestone` — DB is downstream and only mirrors confirmed events. The trigger is double-counting that catches no real failure case.
2. The trigger blocks the dispute-close path, where escrow has been emptied lump-sum. There's no reasonable way to teach it about the dispute path without weaving DB-side state-machine awareness into a sanity check that adds no security.

The `clientWon === true` path (project flips to `cancelled`) doesn't bump completion counters and doesn't close milestones — they retain their last meaningful state, the project status alone is the signal. We can revisit if the cancelled-project UI shows confusion.

### 4.3 TIMESTAMPTZ for deadline columns

A separate but tightly related fix: `disputes.evidence_deadline` and `disputes.voting_deadline` were `TIMESTAMP WITHOUT TIME ZONE` columns. The pg driver serialized JS `Date` values in the Node process's local timezone, then PostgreSQL read them back as if they were already in the session's timezone — silently shifting by the offset. On a UTC+8 host viewed from a UTC PostgreSQL session, this caused `evidence_deadline < NOW()` to evaluate `false` for actually-expired disputes, breaking the keeper sweeps at the SQL filter level.

Migration 017 alters both columns to `TIMESTAMPTZ`, which stores UTC internally regardless of the inserter's timezone.

### 4.4 Dispute granularity — adopt H, defer I/J

For MVP, **disputes stay project-scoped** with winner-takes-all on remaining escrow. Considered milestone-scoping (I/J) and proportional resolution (K) and explicitly chose to defer.

Reasoning recorded in `project_dispute_granularity_deferred.md`: the full end-to-end flow at project granularity is enough to demo the platform's arbitration story. Milestone-scoping is the right long-term direction but it's ~1.5–2 days of contract + backend + UI work, with non-trivial design questions (concurrent disputes, partial project execution under dispute, etc.). User feedback: *"暂时不改吧，就先这样，MVP做到这个程度够了"*.

### 4.5 Phase-aware UI badge

The naive "show `disputes.status` as the badge" UX showed "DAO Voting" for disputes that had passed their voting deadline and were stuck waiting on the keeper or admin. `DisputeStatusBadge` now derives a `phase` from `status` + deadlines + quorum:

| Status | Time/quorum condition | Badge |
|--------|----------------------|-------|
| open | within evidence period | Evidence Phase |
| open | evidence_deadline past | Awaiting Voting Start |
| voting | within voting period | DAO Voting |
| voting | voting_deadline past + quorum met | Awaiting Resolution |
| voting | voting_deadline past + quorum not met | Awaiting Admin Decision |
| resolved | — | Resolved |

The "Awaiting Admin Decision" badge is the user-visible signal that the system is in the manual-resolution path; it shows up alongside the orange "Admin: Owner Resolve" panel in the dispute detail page (only visible to admin wallets).

---

## 5. Consequences

- Disputes progress automatically through their phases without user intervention.
- Admin still required for the no-quorum tail. Admin gets a notification once and only once per such dispute.
- Dashboards remain accurate after dispute resolution (modulo voting_power, see §7).
- The sweep keepers add backend wallet operational dependency: must stay funded, must stay running. If down, disputes stall (no fund-loss risk; recovery on next start).
- `pending_transactions` is **not** used for these keeper writes — they're inline `await tx.wait(N)`, with the DB sync flowing through `chainReconciler` event handlers. This is the documented exception to RFC-009's "use pending_tx for everything"; reasoning is that there's no user side to coordinate UI with.

---

## 6. Schema and code summary

### Migrations
- `015_add_owner_resolution_notified.sql`: `disputes.owner_resolution_notified_at` for idempotent admin notification.
- `017_dispute_deadlines_tz.sql`: `evidence_deadline` / `voting_deadline` → `TIMESTAMPTZ`.
- `018_drop_milestone_escrow_check.sql`: drop `validate_escrow_balance_for_milestone` trigger + function.

### Backend
- `services/consistencyScheduler.ts`: tasks 3 + 4, env-configurable intervals.
- `services/pendingTxActions.ts`: `finalizeResolution` does dev-wins terminal bookkeeping; `handleStartVoting`, `handleExecuteResolution`, `handleOwnerResolve` unchanged in shape.
- `index.ts`: `DisputeDAO` ABI gains `startVoting` (callable by sweep).

### Frontend
- `components/disputes/DisputeStatusBadge.tsx`: phase derivation.
- `components/disputes/OwnerResolvePanel.tsx`: admin-only resolution UI on dispute detail page.

---

## 7. Open Questions

- **`voting_power` for dispute-resolved developers stays 0**. The DB trigger `recalculate_voting_power` computes `voting_power = total_earned × (average_rating / 5.0)`. Dispute-resolved projects don't go through the review flow (no party has the mandate to rate the other under contested terms), so `average_rating` stays NULL → `voting_power` stays 0 even when `total_earned > 0`. Two possible directions:
  - Confer an implicit rating from dispute outcome (e.g. dev-wins = 5 stars).
  - Decouple `voting_power` from `average_rating` for dispute-resolved earnings.
  Both have philosophical implications; defer until the platform has more dispute volume and we can see the actual distribution.
- **Milestone-scoped disputes** (Option I/J). See `project_dispute_granularity_deferred.md`.
- **Decentralized keeper**. Option C — switch to Gelato or similar when the platform actually deploys to a public chain. Out of scope for local debug.

---

## 8. References

- Implementation: `backend/src/services/consistencyScheduler.ts`, `backend/src/services/pendingTxActions.ts`, `backend/src/db/migrations/017*.sql`, `018*.sql`, `frontend/src/components/disputes/DisputeStatusBadge.tsx`
- Memory: `project_dispute_granularity_deferred.md`
- Related: RFC-003 (DAO arbitration system), RFC-009 (tx orchestration), RFC-010 (milestone workflow)
