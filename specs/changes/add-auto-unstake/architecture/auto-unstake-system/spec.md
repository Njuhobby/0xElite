# Auto-Unstake System Architecture

## Purpose

Provides an automated, owner-controlled mechanism for releasing staked USDC back to developers as they complete projects, enforcing the gradual unlock schedule defined in RFC-005 without requiring developer intervention.

## System Context

```
┌──────────────────────┐
│   ProjectManager     │  emits ProjectStateChanged(projectId, old, Completed)
│   (Arbitrum)         │
└──────────┬───────────┘
           │ Event
           ↓
┌──────────────────────┐       ┌─────────────────┐
│  milestoneListener   │──────→│  unlockService   │
│  (Node.js)           │       │  (Node.js)       │
└──────────────────────┘       └────────┬─────────┘
                                        │ 1. Check DB: projects_completed vs unlock_tier
                                        │ 2. If new tier reached:
                                        ↓
                               ┌─────────────────┐
                               │  StakeVault      │  owner calls unstakeFor(dev, 50 USDC)
                               │  (Arbitrum)      │
                               └────────┬─────────┘
                                        │ Unstaked event
                                        ↓
                               ┌─────────────────┐
                               │  stakeListener   │  syncs DB: stake_amount, unlock_history
                               │  (Node.js)       │
                               └────────┬─────────┘
                                        │
                                        ↓
                               ┌─────────────────┐
                               │  PostgreSQL      │  developers, unlock_history tables
                               └─────────────────┘
```

## ADDED Components

### Component: Unlock Service

**Type**: Backend Service (singleton, instantiated at app startup)
**Technology**: Node.js 20 + ethers.js 6
**File**: `backend/src/services/unlockService.ts`
**Responsibility**: Evaluates unlock eligibility on every project completion, executes `unstakeFor()` transactions via the backend wallet, and records results.

**Unlock Schedule**:

| Tier | Projects Required | Unlock Amount | Cumulative Unlocked | Remaining Stake |
|------|-------------------|---------------|---------------------|-----------------|
| 0    | 0                 | 0             | 0                   | 200 USDC        |
| 1    | 5                 | 50 USDC       | 50                  | 150 USDC        |
| 2    | 10                | 50 USDC       | 100                 | 100 USDC        |
| 3    | 15                | 50 USDC       | 150                 | 50 USDC         |
| 4    | 20                | 50 USDC       | 200                 | 0 USDC          |

**Interfaces**:
- `checkAndExecuteUnlock(developerAddress: string): Promise<UnlockResult | null>` — main entry point, called by milestoneListener after project completion
- `getUnlockSchedule(): UnlockTier[]` — returns the static unlock schedule
- `getUnlockStatus(developerAddress: string): Promise<UnlockStatus>` — returns current tier, total unlocked, next unlock threshold

**Algorithm**:
```
checkAndExecuteUnlock(developerAddress):
  1. SELECT projects_completed, unlock_tier, stake_amount FROM developers WHERE wallet_address = address
  2. Determine expectedTier from projects_completed:
     - >= 20 → tier 4
     - >= 15 → tier 3
     - >= 10 → tier 2
     - >=  5 → tier 1
     - <   5 → tier 0
  3. If expectedTier <= currentTier → return null (no unlock needed)
  4. Calculate totalToUnlock = (expectedTier - currentTier) × 50 USDC
     (handles case where developer completes multiple projects in rapid succession
      and skips a tier check — e.g., goes from tier 1 to tier 3 in one batch)
  5. Verify on-chain: stakeVault.stakes(developer) >= totalToUnlock
     - If insufficient on-chain stake, log warning, skip (data inconsistency)
  6. Execute: stakeVault.unstakeFor(developer, totalToUnlock)
  7. Wait for tx confirmation (same confirmation count as other listeners)
  8. On success:
     - UPDATE developers SET unlock_tier = expectedTier, total_unlocked += totalToUnlock, last_unlock_at = NOW()
     - INSERT INTO unlock_history (developer_address, amount, from_tier, to_tier, tx_hash, unlocked_at)
     - Create in-app notification for developer
  9. On failure:
     - Log error with full context
     - Retry up to 3 times with exponential backoff (1s, 4s, 16s)
     - If all retries fail: insert into a `pending_unlocks` queue (or flag in DB) for manual resolution
     - Alert admin
```

**Dependencies**:
- PostgreSQL (developers table, unlock_history table)
- ethers.js Wallet (backend PRIVATE_KEY — same wallet that owns StakeVault)
- StakeVault contract (on-chain)
- Event sync config (RPC URL, confirmations)

**Configuration**:

| Parameter | Source | Default | Notes |
|-----------|--------|---------|-------|
| Unlock schedule | Hardcoded constant | See table above | Change requires code deploy |
| Retry attempts | Environment / config | 3 | Max retries per unlock tx |
| Retry base delay | Environment / config | 1000ms | Exponential: 1s, 4s, 16s |
| Confirmation blocks | `eventSyncConfig.confirmations` | 12 | Wait for tx finality |

**Error Handling**:
- Transaction revert (insufficient on-chain stake): Log + alert admin, do not retry
- Transaction revert (nonce conflict): Retry with refreshed nonce
- RPC timeout: Retry with exponential backoff
- DB error: Retry once, then alert admin
- All retries exhausted: Record in `pending_unlocks`, admin resolves manually

**Monitoring**:
- Log every unlock attempt: `[UnlockService] Unlocking 50 USDC for 0x... (tier 1→2, tx: 0x...)`
- Log every failure: `[UnlockService] FAILED unlock for 0x... — reason: ...`
- Track metrics: `unlocks_executed`, `unlocks_failed`, `unlock_latency_ms`
- Alert: admin notification on any failed unlock

## MODIFIED Components

### Component: milestoneListener

**File**: `backend/src/services/eventListeners/milestoneListener.ts`

**Change**: After processing a `ProjectStateChanged` event where `newState == Completed` and incrementing `projects_completed`, call `unlockService.checkAndExecuteUnlock(developerAddress)`.

**Integration pattern**:
```
processProjectStateChanged(event):
  ... existing logic (update project, increment projects_completed) ...

  // NEW: Check if developer qualifies for unlock
  try {
    const unlockResult = await unlockService.checkAndExecuteUnlock(developerAddress);
    if (unlockResult) {
      logger.info(`Auto-unlock executed: ${unlockResult.amount} USDC for ${developerAddress}`);
    }
  } catch (error) {
    // Unlock failure must NOT block event processing
    logger.error(`Unlock check failed for ${developerAddress}:`, error);
    // unlockService handles its own retries and admin alerts
  }
```

**Key constraint**: Unlock failure MUST NOT block or revert the milestone event processing. The `try/catch` ensures that even if the unlock transaction fails, the project completion is still recorded in the database.

### Component: stakeListener

**File**: `backend/src/services/eventListeners/stakeListener.ts`

**Change**: Add listener for `Unstaked` events (currently only listens for `Staked`).

**On `Unstaked(developer, amount)`**:
```
processUnstakedEvent(event):
  1. Parse developer address and amount from event
  2. UPDATE developers SET
       stake_amount = stake_amount - formatUnits(amount, 6),
       updated_at = NOW()
     WHERE wallet_address = developer
  3. (unlock_history insert already handled by unlockService —
      stakeListener is a fallback sync in case of out-of-band unstakes by owner)
```

### Component: StakeVault Contract

**File**: `contracts/contracts/StakeVault.sol`

**Changes**:
1. `unstake(uint256 amount)` → add `onlyOwner` modifier. This prevents developers from self-unstaking.
2. Add `unstakeFor(address developer, uint256 amount) external onlyOwner nonReentrant`:
   - `require(stakes[developer] >= amount, "Insufficient stake")`
   - `stakes[developer] -= amount`
   - `require(stakeToken.transfer(developer, amount), "Transfer failed")`
   - `emit Unstaked(developer, amount)`
3. Keep existing `unstake()` as owner utility (owner can unstake their own funds if they ever stake, or remove it entirely and only use `unstakeFor`).

**Design Decision**: We add `unstakeFor()` rather than just making `unstake()` owner-only, because the owner needs to specify *which developer* to unstake for. The original `unstake()` uses `msg.sender` to determine the staker, which doesn't work when the owner is calling on behalf of a developer.

## Design Decisions

### Decision: Owner-Only Unstake (No Developer Self-Service)

**Status**: Accepted
**Date**: 2026-03-06

**Context**:
RFC-005 defines a gradual unlock schedule tied to project completion. Two approaches:
1. On-chain enforcement: contract reads `projects_completed` from ProjectManager
2. Off-chain enforcement: backend controls unstake, contract only allows owner

**Decision**:
Off-chain enforcement via owner-only `unstakeFor()`. The backend has full control over when and how much to unstake.

**Consequences**:
- Developers must trust the platform to execute unlocks honestly
- Backend can implement complex unlock logic without contract upgrades
- No cross-contract dependency between StakeVault and ProjectManager
- Simpler contract, lower gas costs
- If backend fails, developer funds are locked until issue is resolved (mitigated by admin manual override)

**Alternatives Considered**:
1. **On-chain enforcement**: StakeVault reads `projectsCompleted` from ProjectManager. Rejected — creates tight coupling between contracts, requires contract upgrade if schedule changes, higher gas for cross-contract calls.
2. **Developer-initiated with validation**: Developer calls `unstake()`, contract validates via oracle/ProjectManager. Rejected — same coupling issues, plus oracle complexity.

### Decision: Automatic Unlock (No Developer Application)

**Status**: Accepted
**Date**: 2026-03-06

**Context**:
Should developers need to request their unlock, or should it happen automatically?

**Decision**:
Fully automatic. When milestoneListener detects a project completion that crosses an unlock threshold, unlockService executes the unstake transaction immediately.

**Consequences**:
- Zero friction for developers — they receive USDC without any action
- Backend must be highly reliable (missed unlock = delayed funds)
- Fallback: admin can manually trigger unlocks if automation fails
- Developer dashboard shows unlock history and upcoming thresholds

### Decision: Skip-Tier Handling

**Status**: Accepted
**Date**: 2026-03-06

**Context**:
If a developer's `projects_completed` jumps from 4 to 11 (e.g., batch processing or historical sync), they cross two tiers at once (tier 1 at 5, tier 2 at 10).

**Decision**:
Calculate the full gap: `(expectedTier - currentTier) × 50 USDC` and unstake in a single transaction. Record as a single unlock_history entry with `from_tier` and `to_tier`.

**Consequences**:
- Single transaction is cheaper and simpler than multiple
- unlock_history accurately records the tier jump
- Edge case is handled gracefully

## Performance Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| Unlock execution latency | < 30 seconds after project completion event | From event detection to tx confirmation |
| Unlock success rate | > 99.5% | Failed unlocks must be retried or escalated |
| Gas cost per unstakeFor | < 60,000 gas | Simple storage update + ERC20 transfer |

## Related Specs

- **Capabilities**: `capabilities/stake-unlock/spec.md`
- **Data Models**: `data-models/developer/schema.md`
- **API**: `api/unstake-notification/spec.md`
- **Existing**: `specs/architecture/stake-vault-contract/spec.md`
- **RFC**: `docs/RFC/RFC-005-sybil-prevention.md`
