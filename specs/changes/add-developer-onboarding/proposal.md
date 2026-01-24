# Change Proposal: Developer Identity & Onboarding

## Why

The platform needs a mechanism for Web3 developers to join and create profiles. This implements the foundation for the developer-side of the marketplace, enabling Sybil-resistant onboarding through economic staking (per RFC-002).

## What Changes

- **ADDED**: StakeVault smart contract for USDC staking
- **ADDED**: Developer profile system (email, GitHub, skills, bio, hourly rate)
- **ADDED**: Wallet signature verification for profile submission
- **ADDED**: Event-driven account activation (listen to Staked events)
- **ADDED**: Developer registration and profile management APIs
- **ADDED**: Frontend pages for application and profile display

## Impact

- **Affected specs**:
  - `capabilities/developer-onboarding` (ADDED)
  - `data-models/developer` (ADDED)
  - `api/developer-management` (ADDED)
  - `architecture/stake-vault-contract` (ADDED)
  - `architecture/event-sync-system` (ADDED)

- **Affected code**:
  - New: `contracts/StakeVault.sol`
  - New: `backend/services/eventListeners/stakeListener.ts`
  - New: `backend/routes/developers.ts`
  - New: `backend/db/models/Developer.ts`
  - New: `frontend/pages/apply.tsx`
  - New: `frontend/pages/developers/[address].tsx`

## Success Criteria

- Developer can stake USDC through StakeVault contract
- Profile data submitted with wallet signature verification
- Staked event triggers backend to activate developer account
- Developer profile viewable at `/developers/:address`
- Developer can edit their own profile
- GitHub username binding prevents duplicate accounts (if provided)
- All validation rules enforced (email unique, stake amount verified)
