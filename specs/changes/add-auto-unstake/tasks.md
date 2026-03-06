# Tasks: add-auto-unstake

## 1. Smart Contract Changes

- [ ] 1.1 Modify `unstake()` to `onlyOwner` in StakeVault.sol
- [ ] 1.2 Add `unstakeFor(address developer, uint256 amount)` function (onlyOwner, nonReentrant)
- [ ] 1.3 Add `Unstaked` event to include `developer` address (already has it) — verify event signature matches listener expectations
- [ ] 1.4 Update StakeVault.test.js — developer calling `unstake()` should revert
- [ ] 1.5 Update StakeVault.test.js — owner calling `unstakeFor()` succeeds
- [ ] 1.6 Update StakeVault.test.js — edge cases (unstake more than staked, zero amount, non-existent developer)
- [ ] 1.7 Run full contract test suite (`npx hardhat test`)

## 2. Database Migration

- [ ] 2.1 Create migration `008_add_unlock_tracking.sql`:
  - Add `total_unlocked DECIMAL(20,6) DEFAULT 0` to developers
  - Add `last_unlock_at TIMESTAMP` to developers
  - Add `unlock_tier SMALLINT DEFAULT 0` to developers (0-4, representing unlock milestones reached)
  - Create `unlock_history` table (developer_address, amount, tier, tx_hash, unlocked_at)
- [ ] 2.2 Run migration and verify schema

## 3. Backend — Unlock Service

- [ ] 3.1 Create `backend/src/services/unlockService.ts`:
  - Define unlock schedule: `[{tier: 1, projects: 5, amount: 50}, {tier: 2, projects: 10, amount: 50}, ...]`
  - `checkAndExecuteUnlock(developerAddress: string)` — reads `projects_completed` and `unlock_tier` from DB, determines if new tier reached, calls `unstakeFor()` on-chain
  - `executeUnstake(developerAddress: string, amount: number)` — sends tx via backend wallet, waits for confirmation, updates DB
  - Error handling: retry with exponential backoff, alert admin on persistent failure
- [ ] 3.2 Unit tests for unlock schedule logic (threshold checks, tier progression)

## 4. Backend — Integration with milestoneListener

- [ ] 4.1 In `milestoneListener.ts`, after incrementing `projects_completed` on `ProjectStateChanged(Completed)`:
  - Call `unlockService.checkAndExecuteUnlock(developerAddress)`
  - Handle errors gracefully (unlock failure should not block milestone event processing)
- [ ] 4.2 Add `Unstaked` event listener to `stakeListener.ts`:
  - Currently only listens for `Staked` events
  - On `Unstaked`: update `developers.stake_amount`, `total_unlocked`, `last_unlock_at`
  - Insert record into `unlock_history`
- [ ] 4.3 Integration tests: simulate project completion → verify unlock triggered

## 5. Backend — Notification

- [ ] 5.1 Create notification record in DB when unlock succeeds (in-app notification)
- [ ] 5.2 Optional: send email notification if developer has email on file
- [ ] 5.3 Add `GET /api/developers/:address/unlock-history` endpoint — returns unlock history for a developer

## 6. Documentation Updates

- [ ] 6.1 Update `docs/RFC/RFC-005-sybil-prevention.md`:
  - `unstake()` is owner-only, developers cannot self-unstake
  - Automatic unlock triggered by backend on project completion
  - Remove Aave yield references (mark as future consideration)
- [ ] 6.2 Update `docs/PROJECT_OVERVIEW.md`:
  - Add unstake/unlock flow to developer lifecycle
  - Document unlock schedule in Money Flow section
- [ ] 6.3 Update `specs/architecture/stake-vault-contract/spec.md`:
  - Document `unstakeFor()` function
  - Update access control table

## 7. Validation & Deployment

- [ ] 7.1 Run contract tests: `cd contracts && npx hardhat test`
- [ ] 7.2 Run backend tests: `cd backend && npm test`
- [ ] 7.3 Manual E2E test on local Hardhat:
  - Deploy contracts, stake as developer, complete 5 mock projects, verify auto-unstake fires
- [ ] 7.4 Archive change: `tigs archive-change add-auto-unstake`
