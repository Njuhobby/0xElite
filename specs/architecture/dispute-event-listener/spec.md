# Dispute Event Listener Architecture

## Purpose

Synchronizes DisputeDAO and EliteToken on-chain events to the PostgreSQL database, maintaining an off-chain mirror for fast API queries and frontend display.

## Components

### Component: Dispute Event Listener

**Type**: Backend Service Module
**Technology**: Node.js, ethers.js v6, PostgreSQL
**Responsibility**: Listens to DisputeDAO and EliteToken contract events, processes them into database records, and triggers side effects (project status updates, voting power sync).

**Event Handlers**:

| Event | Source Contract | Action |
|-------|----------------|--------|
| `DisputeCreated(disputeId, projectId, initiator)` | DisputeDAO | INSERT dispute record, UPDATE project status to 'disputed' |
| `EvidenceSubmitted(disputeId, party, uri)` | DisputeDAO | UPDATE evidence URI on dispute record |
| `VotingStarted(disputeId, votingDeadline, votingSnapshot)` | DisputeDAO | UPDATE dispute status to 'voting', set deadlines |
| `VoteCast(disputeId, voter, supportClient, weight)` | DisputeDAO | INSERT dispute_vote record, UPDATE dispute vote weights |
| `DisputeResolved(disputeId, clientWon, clientShare, developerShare)` | DisputeDAO | UPDATE dispute to 'resolved', UPDATE project status |
| `DisputeResolvedByOwner(disputeId, clientWon)` | DisputeDAO | Same as above, set resolved_by_owner = true |
| `Transfer(from, to, amount)` | EliteToken | UPDATE developer elite_token_balance (mint/burn only) |

**Integration Pattern**:

Follows the same pattern as the existing `escrowEventListener.ts`:
- WebSocket connection with polling fallback
- Checkpoint-based recovery (stores last processed block)
- Transaction-wrapped DB updates (atomic per event)
- Retry logic for failed event processing

**Side Effects**:

```
On DisputeCreated:
  -> Backend calls ProjectManager.updateProjectState(projectId, Disputed)

On DisputeResolved / DisputeResolvedByOwner:
  -> Backend calls ProjectManager.updateProjectState(projectId, Completed or Cancelled)
  -> Backend mints voting participation rewards to all voters
```

**Voting Power Sync Service** (integrated into listener pipeline):

```
On milestone Released event (existing escrow listener):
  -> Recalculate: new_power = developer.total_earned x (developer.average_rating / 5.0)
  -> Compare with current EliteToken balance
  -> Call EliteToken.mint() or EliteToken.burn() to adjust

On review recalculate_ratings trigger (after review INSERT):
  -> Same recalculation and mint/burn
```

**Dependencies**:
- Existing `escrowEventListener.ts` infrastructure (checkpoint system, DB connection)
- DisputeDAO contract ABI
- EliteToken contract ABI
- `ProjectManager` contract (for state updates)
- `EliteToken` contract (for mint/burn calls)

**Configuration**:
- `DISPUTE_DAO_ADDRESS`: DisputeDAO contract address
- `ELITE_TOKEN_ADDRESS`: EliteToken contract address
- `VOTING_REWARD_AMOUNT`: Amount of EliteToken to mint per voter per resolved dispute

**Error Handling**:
- Failed event processing: retry with exponential backoff
- Missed events: checkpoint recovery catches up from last processed block
- DB transaction failure: rollback, retry event
- Contract call failure (mint/burn): log error, retry, alert if persistent

## Design Decisions

### Decision: Extend Existing Listener vs New Service

**Status**: Accepted

**Context**: Could create a separate `disputeEventListener.ts` or extend the existing `escrowEventListener.ts`.

**Decision**: Create a new `disputeEventListener.ts` following the same pattern, to keep separation of concerns. Both listeners share the same checkpoint infrastructure.

**Consequences**:
- Clean separation: escrow events vs dispute events
- Can be deployed/restarted independently
- Shared utility code (checkpoint, DB helpers) stays in common module

### Decision: Backend Mints Voting Rewards After Resolution

**Status**: Accepted

**Context**: Voting participation rewards need to be distributed after dispute resolution.

**Decision**: The event listener, upon processing `DisputeResolved` or `DisputeResolvedByOwner`, queries all voters from `dispute_votes` table and mints a configured reward amount to each.

**Consequences**:
- Reward distribution is asynchronous (slight delay after resolution tx)
- All reward mints are auditable on-chain
- Reward amount is configurable without contract upgrade

## Related Specs

- **Architecture**: `architecture/dispute-dao-contract/spec.md`, `architecture/elite-token-contract/spec.md`
- **Architecture** (existing): `architecture/escrow-event-listener/spec.md`, `architecture/event-sync-system/spec.md`
- **Data Models**: `data-models/dispute/schema.md`, `data-models/dispute-vote/schema.md`
