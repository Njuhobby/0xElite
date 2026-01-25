# Escrow System Change Proposal

## Why

The platform currently lacks financial protection for both clients and developers. Milestones can be marked as "completed" but no actual funds are transferred, creating trust issues and preventing the platform from collecting fees. An escrow system is essential to:
- Protect client funds until deliverables are verified
- Guarantee payment to developers upon milestone approval
- Enable platform fee collection (5-15%)
- Provide dispute resolution backing with frozen funds

## What Changes

- Add EscrowVault smart contract for USDC-based milestone payments
- Implement deposit flow when projects are created/activated
- Auto-release funds when milestones are approved by clients
- Add freeze/unfreeze capability for dispute resolution (integration point for Spec 5)
- Track payment history and escrow balance in database
- Create escrow management API endpoints
- Display escrow status and payment history in frontend
- **BREAKING**: Project creation now requires client to deposit funds into escrow
- **BREAKING**: Milestone approval triggers automatic fund release (irreversible)

## Impact

- **Affected specs**:
  - `capabilities/escrow-management` (ADDED)
  - `capabilities/project-management` (MODIFIED - integrate fund deposit on creation)
  - `data-models/escrow` (ADDED)
  - `data-models/payment-history` (ADDED)
  - `data-models/project` (MODIFIED - add escrow tracking fields)
  - `data-models/milestone` (MODIFIED - add payment tracking fields)
  - `api/escrow-management` (ADDED)
  - `architecture/escrow-vault-contract` (ADDED)
  - `architecture/escrow-event-listener` (ADDED)

- **Affected code**:
  - Smart contracts: New `EscrowVault.sol`
  - Backend: New escrow routes, event listeners, payment tracking
  - Frontend: Project creation flow (add deposit step), project detail page (show escrow balance)
  - Database: 2 new tables, 4 modified tables

## Success Criteria

- Client can deposit project funds into escrow on project creation
- Escrow balance is visible on project detail page
- Milestone approval automatically releases payment to developer
- Platform fee is deducted and sent to treasury
- Escrow can be frozen during disputes (API ready, even if dispute system not yet built)
- Payment history is fully auditable
- All escrow operations emit blockchain events
- 30+ smart contract tests pass
- Integration tests verify end-to-end payment flow
