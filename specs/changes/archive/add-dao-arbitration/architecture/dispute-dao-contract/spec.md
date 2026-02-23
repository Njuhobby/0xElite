# DisputeDAO Contract Architecture

## Purpose

Manages the full dispute lifecycle on-chain: initiation, evidence submission, weighted voting, and resolution with automatic escrow fund distribution.

## System Context

```
┌─────────────┐     createDispute()     ┌──────────────┐
│   Client /  │ ──────────────────────→ │              │
│  Developer  │     castVote()          │  DisputeDAO  │
│  (Frontend) │ ──────────────────────→ │              │
└─────────────┘     submitEvidence()    └──────┬───────┘
                                               │
                    ┌──────────────────────────┤
                    │                          │
                    ↓                          ↓
            ┌──────────────┐          ┌──────────────┐
            │  EscrowVault │          │  EliteToken   │
            │  (freeze,    │          │  (getPast-    │
            │  resolve)    │          │   Votes)      │
            └──────────────┘          └──────────────┘
                    ↑
                    │ events
                    ↓
            ┌──────────────┐
            │   Backend    │
            │  (Event      │
            │  Listener)   │
            └──────────────┘
```

## Components

## ADDED Components

### Component: DisputeDAO.sol

**Type**: Smart Contract (Solidity)
**Technology**: Solidity 0.8.20, OpenZeppelin Contracts Upgradeable v5
**Responsibility**: Manages dispute creation, evidence submission, voting, and resolution with on-chain escrow integration.

**Inheritance**:
- `Initializable` (UUPS upgrade pattern)
- `OwnableUpgradeable` (owner backstop + admin)
- `ReentrancyGuardUpgradeable` (prevent reentrancy on fund transfers)
- `UUPSUpgradeable` (upgrade mechanism)

**State Variables**:
```solidity
IERC20 public usdc;                          // USDC token for arbitration fees
IEliteToken public eliteToken;                // Governance token for voting
IEscrowVault public escrowVault;              // Escrow for freeze/resolve

uint256 public disputeCount;                  // Auto-incrementing dispute ID
uint256 public evidencePeriod;                // Default: 3 days
uint256 public votingPeriod;                  // Default: 5 days
uint256 public arbitrationFee;                // Default: 50 USDC (50 * 10^6)
uint256 public quorumNumerator;               // Default: 25 (representing 25%)
address public treasury;                      // Platform treasury for lost fees

mapping(uint256 => Dispute) public disputes;
mapping(uint256 => uint256) public projectToDispute;  // projectId => disputeId
mapping(uint256 => mapping(address => bool)) public hasVoted;
mapping(uint256 => mapping(address => bool)) public votedForClient;
```

**Structs & Enums**:
```solidity
enum DisputeStatus { Open, Voting, Resolved }

struct Dispute {
    uint256 projectId;
    address client;
    address developer;
    address initiator;
    string clientEvidenceURI;
    string developerEvidenceURI;
    uint256 evidenceDeadline;
    uint256 votingDeadline;
    uint256 votingSnapshot;
    uint256 clientVoteWeight;
    uint256 developerVoteWeight;
    uint256 totalVoteWeight;
    uint256 snapshotTotalSupply;
    DisputeStatus status;
    bool resolvedByOwner;
    bool clientWon;
    uint256 arbitrationFee;
}
```

**Functions**:

| Function | Access | Description |
|----------|--------|-------------|
| `initialize(usdc, eliteToken, escrowVault, treasury)` | initializer | Set dependencies |
| `createDispute(projectId, evidenceURI)` | public | File dispute, freeze escrow, pay fee |
| `submitEvidence(disputeId, evidenceURI)` | public | Submit/update evidence during evidence period |
| `startVoting(disputeId)` | public | Transition from evidence to voting phase |
| `castVote(disputeId, supportClient)` | public | Cast weighted vote |
| `executeResolution(disputeId)` | public | Resolve with quorum met |
| `ownerResolve(disputeId, clientWon)` | onlyOwner | Resolve when quorum not met |
| `setArbitrationFee(newFee)` | onlyOwner | Update arbitration fee |
| `setQuorumNumerator(newQuorum)` | onlyOwner | Update quorum percentage |
| `setTreasury(newTreasury)` | onlyOwner | Update treasury address |
| `getDispute(disputeId)` | view | Get dispute details |
| `quorumReached(disputeId)` | view | Check if quorum is met |

**Events**:
```solidity
event DisputeCreated(uint256 indexed disputeId, uint256 indexed projectId, address initiator);
event EvidenceSubmitted(uint256 indexed disputeId, address party, string evidenceURI);
event VotingStarted(uint256 indexed disputeId, uint256 votingDeadline, uint256 votingSnapshot);
event VoteCast(uint256 indexed disputeId, address indexed voter, bool supportClient, uint256 weight);
event DisputeResolved(uint256 indexed disputeId, bool clientWon, uint256 clientShare, uint256 developerShare);
event DisputeResolvedByOwner(uint256 indexed disputeId, bool clientWon);
```

**Dependencies**:
- `EscrowVault` — calls `freeze(projectId)` and `resolveDispute(projectId, developer, clientShare, developerShare)`
- `EliteToken` — calls `getPastVotes(voter, snapshot)` and `getPastTotalSupply(snapshot)` for voting power
- `IERC20 USDC` — for arbitration fee transfers

**Access Control**:
- `createDispute`: Only project client or assigned developer
- `submitEvidence`: Only dispute client or developer, during evidence period
- `startVoting`: Anyone, after evidence deadline
- `castVote`: Any address with EliteToken balance > 0 at snapshot, not a dispute party
- `executeResolution`: Anyone, after voting deadline, if quorum met
- `ownerResolve`: Only owner, after voting deadline, if quorum NOT met

**Configuration** (all updateable by owner):
- `evidencePeriod`: 3 days (259,200 seconds)
- `votingPeriod`: 5 days (432,000 seconds)
- `arbitrationFee`: 50 USDC (50,000,000 in 6-decimal units)
- `quorumNumerator`: 25 (representing 25%)
- `treasury`: Platform treasury address

**Key Flow: createDispute**:
```
1. Verify caller is client or developer of the project
2. Verify no active dispute on the project (projectToDispute check)
3. Transfer arbitrationFee USDC from caller to this contract
4. Call escrowVault.freeze(projectId) to lock funds
5. Store dispute with evidenceDeadline = block.timestamp + evidencePeriod
6. Set projectToDispute[projectId] = disputeId
7. Emit DisputeCreated event
```

**Key Flow: executeResolution**:
```
1. Verify status == Voting and block.timestamp >= votingDeadline
2. Calculate quorum: totalVoteWeight >= (snapshotTotalSupply * quorumNumerator / 100)
3. Require quorum met
4. Determine winner: clientVoteWeight > developerVoteWeight
5. Get remaining escrow balance from EscrowVault
6. Call escrowVault.resolveDispute(projectId, developer, clientShare, developerShare)
7. Refund arbitration fee to initiator if their side won, else send to treasury
8. Update dispute status to Resolved
9. Emit DisputeResolved event
```

**Security Considerations**:
- ReentrancyGuard on all fund-transferring functions
- Snapshot-based voting prevents balance manipulation during voting
- One vote per address per dispute
- Project parties excluded from voting
- Owner resolve only available when quorum NOT met

## Design Decisions

### Decision: Backend Handles ProjectManager State Change

**Status**: Accepted

**Context**: `ProjectManager.updateProjectState()` is `onlyOwner`. Adding DisputeDAO authorization requires a contract upgrade.

**Decision**: Backend event listener detects `DisputeCreated` and `DisputeResolved` events, then calls `ProjectManager.updateProjectState()` as the owner.

**Consequences**:
- No ProjectManager upgrade needed for MVP
- Small delay between on-chain dispute creation and project state update
- Backend must be running for state sync (acceptable — already required for other features)

### Decision: Anyone Can Trigger Phase Transitions

**Status**: Accepted

**Context**: `startVoting()` and `executeResolution()` need to be callable after deadlines.

**Decision**: These functions are permissionless — anyone can call them once the time conditions are met.

**Consequences**:
- No dependency on specific parties to advance the dispute
- Frontend or backend can trigger transitions
- Bot-friendly — could automate with a keeper

### Decision: Separate Quorum Check from Resolution

**Status**: Accepted

**Context**: If quorum isn't met, the dispute needs a different resolution path.

**Decision**: `executeResolution()` requires quorum. `ownerResolve()` requires quorum NOT met. They are mutually exclusive.

**Consequences**:
- Clear separation of community vs owner resolution
- On-chain `resolvedByOwner` flag makes transparency auditable
- Owner cannot override community vote when quorum is met

## Performance Requirements

| Metric | Target | Measurement |
|--------|--------|-------------|
| createDispute gas | < 200,000 | Single transaction gas cost |
| castVote gas | < 100,000 | Single transaction gas cost |
| executeResolution gas | < 300,000 | Includes escrow distribution |

## Related Specs

- **Capabilities**: `capabilities/dispute-resolution/spec.md`
- **Architecture**: `architecture/elite-token-contract/spec.md`, `architecture/dispute-event-listener/spec.md`
- **Data Models**: `data-models/dispute/schema.md`
