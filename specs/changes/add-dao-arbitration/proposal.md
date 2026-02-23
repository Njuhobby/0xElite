## Why

When clients and developers cannot agree on milestone completion, there is no escalation path — escrow funds remain locked indefinitely. The platform needs a decentralized, community-driven dispute resolution mechanism where all active developers vote on outcomes, with voting power weighted by platform contribution (earnings × reputation).

## What Changes

- Add EliteToken.sol — soulbound ERC20Votes governance token for reputation-weighted voting
- Add DisputeDAO.sol — dispute lifecycle contract (initiation, evidence, voting, resolution)
- Add dispute database tables (disputes, dispute_votes)
- Add dispute management API routes
- Add dispute event listener for on-chain event synchronization
- Add voting power sync service (backend mints/burns EliteToken based on developer earnings + rating)
- Modify developer data model to track voting power
- Integrate with existing EscrowVault freeze/resolveDispute functions

## Impact

- **Affected specs**:
  - capabilities/dispute-resolution (NEW)
  - data-models/dispute (NEW)
  - data-models/dispute-vote (NEW)
  - data-models/developer (MODIFIED — voting power tracking)
  - api/dispute-management (NEW)
  - architecture/elite-token-contract (NEW)
  - architecture/dispute-dao-contract (NEW)
  - architecture/dispute-event-listener (NEW)
- **Affected code**: Smart contracts, backend API, event listener, frontend dashboards

## Success Criteria

- Either party can file a dispute with evidence and 50 USDC fee
- Escrow is frozen during dispute
- All active developers with voting power can cast weighted votes
- Simple majority with 25% quorum determines outcome
- Owner can resolve if quorum not met
- Escrow funds distributed to winner automatically
- Voting participation rewards minted to voters
