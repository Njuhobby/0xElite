## 1. Smart Contracts

- [ ] 1.1 Implement EliteToken.sol (soulbound ERC20Votes, UUPS upgradeable)
- [ ] 1.2 Implement DisputeDAO.sol (dispute lifecycle, UUPS upgradeable)
- [ ] 1.3 Write Foundry tests for EliteToken (mint, burn, transfer blocked, delegation, snapshots)
- [ ] 1.4 Write Foundry tests for DisputeDAO (full dispute lifecycle, quorum, owner resolve)
- [ ] 1.5 Integration test: DisputeDAO + EscrowVault freeze/resolve flow

## 2. Database Schema

- [ ] 2.1 Create migration 005_create_disputes_table.sql (disputes + dispute_votes tables)
- [ ] 2.2 Add voting_power field to developers table (or track via token balance)

## 3. Backend Implementation

- [ ] 3.1 Create backend types for disputes (TypeScript interfaces)
- [ ] 3.2 Implement voting power sync service (recalculate on milestone payment + review → mint/burn EliteToken)
- [ ] 3.3 Implement dispute API routes (create, get, evidence, vote, resolve, owner-resolve)
- [ ] 3.4 Create dispute event listener (DisputeCreated, VotingStarted, VoteCast, DisputeResolved events)
- [ ] 3.5 Integrate dispute status with project status updates

## 4. Frontend Implementation

- [ ] 4.1 Create DisputeCreateModal (evidence upload, fee payment)
- [ ] 4.2 Create dispute detail page with timeline, evidence panel, voting panel
- [ ] 4.3 Create active disputes list page
- [ ] 4.4 Add "File Dispute" button to project detail pages (client + developer)
- [ ] 4.5 Add "Disputes" nav item to both dashboard sidebars
- [ ] 4.6 Show dispute status on project cards

## 5. Validation & Documentation

- [ ] 5.1 Run `tigs validate-specs --change add-dao-arbitration`
- [ ] 5.2 Review all delta specs
- [ ] 5.3 Update docs/PROJECT_OVERVIEW.md

## 6. Deployment

- [ ] 6.1 Archive change: `tigs archive-change add-dao-arbitration`
