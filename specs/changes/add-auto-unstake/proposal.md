# Change Proposal: add-auto-unstake

## Why

The current `unstake()` function in StakeVault has no access control or unlock conditions — any staked developer can withdraw their full stake at any time, defeating the Sybil prevention mechanism described in RFC-005. The unlock schedule (gradual release at 5/10/15/20 completed projects) exists only in documentation but is not enforced by code. Additionally, developers should not need to manually request unstaking; the platform should automatically release funds when conditions are met.

## What Changes

- **BREAKING**: `unstake()` in StakeVault.sol becomes `onlyOwner` — developers can no longer call it directly
- Add `unstakeFor(address developer, uint256 amount)` owner-only function for programmatic unstaking
- Backend tracks `projects_completed` per developer (source of truth: ProjectManager contract's `ProjectStateChanged` events)
- Backend automatically calls `unstakeFor()` when a developer crosses an unlock threshold (5/10/15/20 projects)
- New `unlockListener` service monitors project completions and triggers unstake transactions
- Developer notification on successful unlock (in-app + optional email)
- Remove Aave yield references from RFC-005 (out of scope for now)

## Impact

- **Affected specs**:
  - `architecture/auto-unstake-system` (NEW)
  - `capabilities/stake-unlock` (NEW)
  - `data-models/developer` (MODIFIED — add unlock tracking fields)
  - `api/unstake-notification` (NEW — notification endpoint)
- **Affected code**:
  - `contracts/contracts/StakeVault.sol` — access control change, new `unstakeFor()`
  - `contracts/test/StakeVault.test.js` — update tests for new access control
  - `backend/src/services/eventListeners/milestoneListener.ts` — trigger unlock check after project completion
  - `backend/src/services/unlockService.ts` — new service for unlock logic + tx execution
  - `backend/src/db/migrations/008_add_unlock_tracking.sql` — new migration
  - `docs/RFC/RFC-005-sybil-prevention.md` — update to reflect owner-only unstake, remove Aave references
  - `docs/PROJECT_OVERVIEW.md` — update staking/unstaking flow

## Success Criteria

- Developers cannot call `unstake()` directly (transaction reverts)
- When a developer completes their 5th project, 50 USDC is automatically unstaked and returned to their wallet
- Same automatic unlock at 10th, 15th, and 20th project (50 USDC each)
- Developer receives notification after each unlock
- `projects_completed` count is derived from on-chain ProjectManager events (not manually set)
- Existing staked developers are not affected (their stake remains until they meet unlock conditions)
- StakeVault contract upgrade is backward-compatible (UUPS proxy)
