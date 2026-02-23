# RFC-003: DAO Arbitration System

| Field       | Value                                   |
|-------------|-----------------------------------------|
| RFC         | 003                                     |
| Title       | DAO Arbitration System                  |
| Author      | 0xElite Team                            |
| Status      | Accepted                                |
| Created     | 2026-02-17                              |
| Updated     | 2026-02-23                              |

---

## 1. Context

0xElite uses milestone-based escrow payments between clients and developers. When disagreements arise — developer delivers subpar work, client refuses to approve valid work, or scope disputes occur — the platform needs a **decentralized, trustless dispute resolution mechanism**.

Currently, if a milestone is rejected, it simply reverts to `in_progress` and the developer resubmits. There is no formal escalation path when the two parties cannot reach agreement. The EscrowVault contract already has `freeze()`, `unfreeze()`, and `resolveDispute()` functions reserved for a DisputeDAO caller, but no DisputeDAO contract exists yet.

---

## 2. Problem Statement

Without a dispute resolution system:

- **Clients can hold funds hostage**: Refuse to approve valid work indefinitely, keeping developer funds locked in escrow
- **Developers can deliver garbage**: Submit low-quality work and claim completion, forcing clients to accept or abandon funds
- **No neutral third party**: Neither side has recourse — the only option is to walk away
- **Platform trust erodes**: Users avoid high-value projects because there's no protection when things go wrong

The arbitration system must be:
- **Decentralized**: No single admin decides outcomes
- **Incentive-aligned**: Voters' long-term interests are tied to platform health
- **Transparent**: All evidence and votes are publicly verifiable
- **Integrated**: Works with existing EscrowVault freeze/resolve mechanics

---

## 3. Core Design Principles

### 3.1 Community Governance, Not Hired Jury

Unlike systems like Kleros (paid jurors with economic staking), 0xElite uses a **community governance model**: all active developers participate in dispute resolution as part of their platform membership.

**Why?** Developers' livelihoods depend on the platform's reputation. A platform nobody trusts is a platform nobody uses. This self-interest alignment is the strongest possible incentive for fair voting — no additional staking or slashing mechanism is needed.

### 3.2 Reputation-Weighted Voting Power

Not all votes are equal. Developers who have invested more into the platform — measured by earnings and reputation — have proportionally more voting power. This is implemented via a **soulbound (non-transferable) ERC20Votes governance token**.

**Voting power formula**:

```
voting_power = total_earned × (average_rating / 5.0)
```

| Developer | Platform Earnings | Rating | Voting Power |
|-----------|-------------------|--------|-------------|
| Alice     | $50,000           | 5.0    | 50,000      |
| Bob       | $50,000           | 3.0    | 30,000      |
| Carol     | $5,000            | 5.0    | 5,000       |
| New Dave  | $0                | —      | 0           |

**Rationale**:
- Developers who earn more from the platform have more to lose if trust erodes
- High-reputation developers have demonstrated consistent quality — their judgment is worth more
- New developers (no earnings, no rating) have zero voting power until they prove their commitment through completed work
- Soulbound = non-transferable, cannot be bought or borrowed

**Token minting**: Voting power is recalculated and minted/burned whenever a milestone payment completes or a new review is received. The ERC20Votes extension provides built-in historical snapshots, so voting power is captured at the moment a dispute enters its voting phase.

### 3.3 Owner as Backstop

If a dispute vote fails to reach quorum, the platform owner makes the final decision. The owner has the strongest incentive to rule fairly — their entire business depends on platform credibility.

---

## 4. Dispute Lifecycle (4 Phases)

```
Phase 1: INITIATION
┌──────────────────────────────────────────────────────────┐
│  Either party (client or developer) files dispute         │
│  → Pays 50 USDC arbitration fee (refunded if they win)   │
│  → Submits initial evidence (IPFS URI)                    │
│  → EscrowVault.freeze(projectId)                          │
│  → Project status → Disputed                              │
└──────────────────────────────────────────────────────────┘
                         ↓
Phase 2: EVIDENCE PERIOD (3 days)
┌──────────────────────────────────────────────────────────┐
│  Both parties submit/update evidence                      │
│  → Each side uploads a document (PDF/DOCX) via frontend   │
│  → Document stored on IPFS, CID recorded on-chain         │
│  → Evidence submissions logged on-chain via events         │
│  → No voting happens during this period                   │
└──────────────────────────────────────────────────────────┘
                         ↓
Phase 3: VOTING PERIOD (5 days)
┌──────────────────────────────────────────────────────────┐
│  Transition triggered by anyone after evidence deadline    │
│  → All active developers can vote (public, on-chain)      │
│  → Vote: Support Client OR Support Developer              │
│  → Voting power = soulbound governance token balance       │
│  → No arbiter staking required                            │
└──────────────────────────────────────────────────────────┘
                         ↓
Phase 4: RESOLUTION
┌──────────────────────────────────────────────────────────┐
│  Anyone can trigger after voting deadline                  │
│                                                           │
│  IF quorum reached (≥25% of total voting power):          │
│  → Simple majority (>50%) determines winner               │
│  → Distribute escrow funds to winning party               │
│  → Refund arbitration fee to winning party                │
│                                                           │
│  IF quorum NOT reached:                                   │
│  → Owner makes final ruling                               │
│  → Owner calls resolveDispute with chosen distribution    │
│                                                           │
│  → EscrowVault.resolveDispute()                           │
│  → Update reputation for both parties                     │
└──────────────────────────────────────────────────────────┘
```

### 4.1 Voter Eligibility

- Must be an **active developer** on the platform (staked in StakeVault, `stakes[address] >= requiredStake`)
- Must have **voting power > 0** (i.e., completed at least one project with a rating)
- Must **NOT** be a party to the dispute (not the client, not the assigned developer)

### 4.2 Voting Mechanism

**Public voting, simple majority, weighted by governance token balance.**

- Votes are cast on-chain via `castVote(disputeId, support)` — visible to everyone
- Each vote's weight equals the voter's governance token balance at the snapshot taken when voting starts
- Result: `clientVoteWeight > developerVoteWeight` → client wins (and vice versa)
- Quorum: at least 25% of total governance token supply must participate

**Why public voting?** With a large voter pool (all active developers), herd behavior is diluted. Commit-reveal would double gas costs and add complexity (two transactions per voter, handling non-reveals) for minimal benefit in a large-group setting.

### 4.3 Fund Distribution

When the dispute resolves, the remaining escrow balance (total deposited - already released) is distributed:

| Outcome | Client Gets | Developer Gets |
|---------|-------------|----------------|
| Client wins | 100% of remaining escrow | 0 |
| Developer wins | 0 | 100% of remaining escrow |

Binary outcomes keep voters focused on a clear question: **"Did the developer fulfill the milestone requirements?"** Partial splits can be added in a future upgrade.

### 4.4 Arbitration Fee

- **Amount**: 50 USDC, paid by dispute initiator at creation time
- **Win**: Fee refunded to initiator
- **Lose**: Fee goes to platform treasury
- **No minimum escrow balance required**: A user may file a dispute regardless of how much remains in escrow. The arbitration fee ensures only serious disputes are filed; beyond that, if someone is willing to pay 50 USDC to dispute $10, that is their right
- **Purpose**: Prevents frivolous disputes. Low enough to not deter legitimate disputes, high enough to discourage spam

### 4.5 Evidence Format

Both parties submit evidence as a **document file (PDF, DOCX, or Markdown)** through the frontend:
- Frontend accepts PDF/DOCX/MD uploads (validated client-side and server-side)
- Document is uploaded to IPFS, returning a content-addressed CID
- CID is stored on-chain via `submitEvidence()`, proving the document existed at submission time and hasn't been altered
- Voters can download and review the original documents from the dispute detail page

### 4.6 Voting Participation Reward

To encourage active participation in dispute resolution, voters receive a small amount of EliteToken (governance token) as a reward for casting a vote:
- Reward is minted by the backend after the dispute resolves
- Only voters who actually cast a vote receive the reward (not abstainers)
- Reward amount TBD — should be meaningful enough to incentivize participation but small enough to not distort voting power distribution over time

---

## 5. Smart Contract Design

### 5.1 EliteToken.sol — Soulbound Governance Token

A non-transferable ERC20Votes token that represents voting power.

```
EliteToken.sol (UUPS Upgradeable)
├── Inherits: ERC20Upgradeable, ERC20VotesUpgradeable, OwnableUpgradeable, UUPSUpgradeable
├── Key Behavior:
│   ├── transfer/transferFrom → REVERTED (soulbound)
│   ├── mint(address, amount) → onlyOwner (called by backend)
│   ├── burn(address, amount) → onlyOwner (called by backend)
│   └── delegate() → supported (developers must self-delegate to activate voting)
│
├── Voting Power Calculation (off-chain, backend computes):
│   └── voting_power = total_earned × (average_rating / 5.0)
│       → Recalculated on milestone payment or new review
│       → Backend calls mint/burn to adjust token balance
│
└── ERC20Votes Features (inherited from OpenZeppelin):
    ├── Historical balance snapshots (checkpoints)
    ├── getPastVotes(address, timepoint) → voting power at snapshot
    └── clock() → block.timestamp (for L2 compatibility)
```

**Why soulbound?** Voting power must reflect genuine platform contribution. If tokens were transferable, a wealthy actor could buy voting power to influence disputes without having any stake in the platform's reputation.

**Why not compute on-chain?** `total_earned` and `average_rating` live in PostgreSQL (per RFC-002 — these are off-chain data). The backend is the authority for these values. It computes the token amount and mints accordingly. This is the same pattern used for developer status (backend listens to StakeVault events → updates DB).

### 5.2 DisputeDAO.sol — Dispute Resolution Contract

```
DisputeDAO.sol (UUPS Upgradeable)
├── Inherits: Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable
├── State:
│   ├── disputes: mapping(uint256 => Dispute)
│   ├── disputeCount: uint256
│   ├── projectToDispute: mapping(uint256 => uint256)
│   └── quorumNumerator: uint256 (25, representing 25%)
│
├── External Dependencies:
│   ├── EscrowVault (freeze, resolveDispute)
│   ├── EliteToken (getVotes, getPastVotes, totalSupply)
│   └── IERC20 USDC (arbitration fee)
│
├── Constants:
│   ├── EVIDENCE_PERIOD = 3 days
│   ├── VOTING_PERIOD = 5 days
│   └── ARBITRATION_FEE = 50 USDC (configurable by owner)
│
└── Functions:
    ├── createDispute(projectId, evidenceURI)          → Phase 1
    ├── submitEvidence(disputeId, evidenceURI)          → Phase 2
    ├── startVoting(disputeId)                          → Phase 2→3 transition
    ├── castVote(disputeId, support)                    → Phase 3
    ├── executeResolution(disputeId)                    → Phase 4 (quorum met)
    ├── ownerResolve(disputeId, clientWon)              → Phase 4 (quorum not met)
    └── View functions:
        ├── getDispute(disputeId) → dispute details
        ├── hasVoted(disputeId, voter) → bool
        └── quorumReached(disputeId) → bool
```

### 5.3 Dispute Struct

```solidity
enum DisputeStatus { Open, Voting, Resolved }

struct Dispute {
    uint256 projectId;
    address client;
    address developer;
    address initiator;
    string clientEvidenceURI;        // IPFS CID
    string developerEvidenceURI;     // IPFS CID
    uint256 evidenceDeadline;        // Phase 2 ends
    uint256 votingDeadline;          // Phase 3 ends
    uint256 votingSnapshot;          // Timestamp for voting power snapshot
    uint256 clientVoteWeight;        // Accumulated weighted votes for client
    uint256 developerVoteWeight;     // Accumulated weighted votes for developer
    uint256 totalVoteWeight;         // Total weight of all votes cast
    DisputeStatus status;
    bool resolvedByOwner;            // True if quorum wasn't met
    bool clientWon;                  // Final outcome
    uint256 arbitrationFee;
}

// Separate mapping for vote tracking (not in struct due to nested mapping limitation)
// mapping(uint256 => mapping(address => bool)) public hasVoted;
// mapping(uint256 => mapping(address => bool)) public votedForClient;
```

### 5.4 Key Function Flows

```
createDispute(projectId, evidenceURI):
  require: caller is project client or developer
  require: project not already disputed
  require: USDC.transferFrom(caller, address(this), ARBITRATION_FEE)
  → EscrowVault.freeze(projectId)
  → Store dispute with evidenceDeadline = now + 3 days
  → emit DisputeCreated(disputeId, projectId, initiator)

startVoting(disputeId):
  require: block.timestamp >= evidenceDeadline
  require: status == Open
  → Set votingDeadline = now + 5 days
  → Set votingSnapshot = block.timestamp
  → status = Voting
  → emit VotingStarted(disputeId, votingDeadline, votingSnapshot)

castVote(disputeId, supportClient):
  require: status == Voting
  require: block.timestamp < votingDeadline
  require: !hasVoted[disputeId][caller]
  require: caller != client && caller != developer
  → weight = EliteToken.getPastVotes(caller, votingSnapshot)
  require: weight > 0
  → Update clientVoteWeight or developerVoteWeight
  → totalVoteWeight += weight
  → hasVoted[disputeId][caller] = true
  → emit VoteCast(disputeId, caller, supportClient, weight)

executeResolution(disputeId):
  require: status == Voting
  require: block.timestamp >= votingDeadline
  require: totalVoteWeight >= quorum (25% of EliteToken.totalSupply at snapshot)
  → Determine winner by simple majority
  → Call EscrowVault.resolveDispute(...)
  → Refund arbitration fee to winner (or winning party's initiator)
  → status = Resolved
  → emit DisputeResolved(disputeId, clientWon, clientShare, developerShare)

ownerResolve(disputeId, clientWon):
  require: onlyOwner
  require: status == Voting
  require: block.timestamp >= votingDeadline
  require: totalVoteWeight < quorum
  → Call EscrowVault.resolveDispute(...)
  → resolvedByOwner = true
  → status = Resolved
  → emit DisputeResolvedByOwner(disputeId, clientWon)
```

### 5.5 Interactions with Existing Contracts

```
createDispute() ───→ EscrowVault.freeze(projectId)

executeResolution()
  or               ───→ EscrowVault.resolveDispute(projectId, developer, clientShare, devShare)
ownerResolve()
```

**ProjectManager integration**: `updateProjectState()` is currently `onlyOwner`. For MVP, the backend (as contract owner) listens for DisputeDAO events and calls `updateProjectState(projectId, Disputed)` / `updateProjectState(projectId, Completed|Cancelled)`. No ProjectManager contract upgrade needed.

### 5.6 Data Storage (per RFC-002)

| Data | Location | Rationale |
|------|----------|-----------|
| Dispute status, vote weights, deadlines | On-chain (DisputeDAO) | Controls money distribution |
| Voting power balances | On-chain (EliteToken) | Determines vote weight |
| Evidence content (documents, screenshots) | IPFS | Too large for chain |
| Evidence IPFS CIDs | On-chain (DisputeDAO) | Proves evidence wasn't altered |
| Arbitration fee payment | On-chain (USDC transfer) | Financial transaction |
| Dispute timeline/history for UI | Off-chain (PostgreSQL) | Performance, indexed from events |
| Voting power source data (earnings, rating) | Off-chain (PostgreSQL) | Per RFC-002: informational data |

---

## 6. Backend Design

### 6.1 Database Schema

New migration `005_create_disputes_table.sql`:

```sql
-- Disputes table
CREATE TABLE disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_number SERIAL,
    project_id UUID NOT NULL REFERENCES projects(id),
    client_address VARCHAR(42) NOT NULL,
    developer_address VARCHAR(42) NOT NULL,
    initiator_address VARCHAR(42) NOT NULL,
    initiator_role VARCHAR(20) NOT NULL CHECK (initiator_role IN ('client', 'developer')),
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'voting', 'resolved')),
    client_evidence_uri VARCHAR(500),
    developer_evidence_uri VARCHAR(500),
    evidence_deadline TIMESTAMP NOT NULL,
    voting_deadline TIMESTAMP,
    voting_snapshot TIMESTAMP,
    client_vote_weight DECIMAL(20,6) NOT NULL DEFAULT 0,
    developer_vote_weight DECIMAL(20,6) NOT NULL DEFAULT 0,
    total_vote_weight DECIMAL(20,6) NOT NULL DEFAULT 0,
    quorum_required DECIMAL(20,6),
    winner VARCHAR(20) CHECK (winner IN ('client', 'developer')),
    resolved_by_owner BOOLEAN NOT NULL DEFAULT false,
    client_share DECIMAL(20,6),
    developer_share DECIMAL(20,6),
    arbitration_fee DECIMAL(20,6) NOT NULL DEFAULT 50.000000,
    chain_dispute_id INTEGER,
    creation_tx_hash VARCHAR(66),
    resolution_tx_hash VARCHAR(66),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Individual votes
CREATE TABLE dispute_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID NOT NULL REFERENCES disputes(id),
    voter_address VARCHAR(42) NOT NULL,
    support_client BOOLEAN NOT NULL,
    vote_weight DECIMAL(20,6) NOT NULL,
    tx_hash VARCHAR(66),
    voted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(dispute_id, voter_address)
);

CREATE INDEX idx_disputes_project ON disputes(project_id);
CREATE INDEX idx_disputes_status ON disputes(status);
CREATE INDEX idx_disputes_initiator ON disputes(initiator_address);
CREATE INDEX idx_dispute_votes_dispute ON dispute_votes(dispute_id);
CREATE INDEX idx_dispute_votes_voter ON dispute_votes(voter_address);
```

### 6.2 Governance Token Management

The backend is responsible for keeping EliteToken balances in sync with platform data:

```
On milestone payment completion:
  → Recalculate: new_power = total_earned × (average_rating / 5.0)
  → Compare with current token balance
  → Mint or burn the difference via EliteToken contract

On new review received:
  → Same recalculation and mint/burn
```

This runs in the existing event listener pipeline — milestone payments and reviews already trigger DB updates, the token adjustment is an additional step.

### 6.3 API Routes

```
POST   /api/disputes                     Create dispute (initiates on-chain tx)
GET    /api/disputes/:id                 Get dispute details + votes
GET    /api/disputes/project/:projectId  Get dispute for a project
PUT    /api/disputes/:id/evidence        Submit/update evidence
POST   /api/disputes/:id/vote            Cast vote
POST   /api/disputes/:id/resolve         Trigger resolution (anyone)
POST   /api/disputes/:id/owner-resolve   Owner resolution (owner only, quorum not met)
GET    /api/disputes/active              List active disputes (for voting)
GET    /api/disputes/my/:address         Disputes involving address (as party or voter)
```

### 6.4 Event Listener Extension

Extend `escrowEventListener.ts` (or create `disputeEventListener.ts`):

```
DisputeCreated(disputeId, projectId, initiator)
  → INSERT into disputes table
  → UPDATE project status to 'disputed'

EvidenceSubmitted(disputeId, party, uri)
  → UPDATE evidence URI in disputes table

VotingStarted(disputeId, votingDeadline, votingSnapshot)
  → UPDATE dispute status to 'voting', set deadlines

VoteCast(disputeId, voter, supportClient, weight)
  → INSERT into dispute_votes table
  → UPDATE dispute vote weights

DisputeResolved(disputeId, clientWon, clientShare, developerShare)
  → UPDATE dispute status to 'resolved'
  → UPDATE project status

DisputeResolvedByOwner(disputeId, clientWon)
  → Same as above, mark resolved_by_owner = true
```

---

## 7. Frontend Design

### 7.1 Pages

| Page | Route | Description |
|------|-------|-------------|
| Active Disputes | `/disputes` | List of all active disputes open for voting |
| Dispute Detail | `/disputes/:id` | Timeline, evidence, voting status, cast vote |
| My Disputes | `/dashboard/*/disputes` | Disputes where user is a party |

### 7.2 Components

| Component | Description |
|-----------|-------------|
| `DisputeCreateModal` | File dispute from project detail page. Submit evidence URI, pay 50 USDC fee |
| `EvidencePanel` | Shows both parties' evidence. Upload/update button during evidence period |
| `VotingPanel` | For eligible developers: cast vote (support client / support developer). Shows current tally, quorum progress, deadline countdown |
| `DisputeTimeline` | Visual timeline of dispute phases with dates and status |
| `DisputeStatusBadge` | Phase indicator (Open → Voting → Resolved) |
| `DisputeCard` | Summary card for dispute listings |

### 7.3 Integration Points

- **Project Detail Page** (both client and developer views): "File Dispute" button when project is `in_progress` or `assigned`
- **Developer Sidebar**: "Disputes" nav item showing active disputes requiring votes
- **Client Sidebar**: "Disputes" nav item showing disputes involving client's projects
- **Project Cards**: Show dispute status badge when project is disputed

---

## 8. Security Considerations

### 8.1 Attack Vectors

| Attack | Mitigation |
|--------|------------|
| **Sybil voting** — Create many wallets to accumulate voting power | Voting power requires actual platform earnings and reviews from real clients. Creating fake projects requires client USDC deposits into escrow — prohibitively expensive |
| **Vote buying** — Pay developers to vote a certain way | Possible but difficult at scale. Votes are public, so bribery is detectable. Platform can investigate suspicious voting patterns |
| **Frivolous disputes** — Spam disputes to grief counterparty | 50 USDC fee deters spam. Fee forfeited if initiator loses |
| **Evidence tampering** — Modify evidence after submission | IPFS CIDs are content-addressed. On-chain URI proves what was submitted at what time |
| **Low participation** — Not enough developers vote | 25% quorum threshold. If not met, owner resolves. Owner has strongest incentive for fair ruling |
| **Token balance manipulation** — Earn tokens, vote, then somehow reduce balance | ERC20Votes snapshots: voting power is locked at the `votingSnapshot` timestamp. Post-snapshot changes don't affect the vote |
| **Backend token minting abuse** — Backend operator mints tokens to favored addresses | Backend is owned by platform operator. This is a centralization tradeoff accepted for MVP. Mitigation: all mint/burn transactions are on-chain and auditable |

### 8.2 Centralization Tradeoffs

This design has two deliberate centralization points:

1. **Token minting by backend**: The backend computes voting power from off-chain data and mints tokens. A fully decentralized version would compute everything on-chain, but `total_earned` and `average_rating` are off-chain data per RFC-002.

2. **Owner as quorum backstop**: If 25% quorum isn't reached, the owner decides. This prevents disputes from freezing indefinitely but introduces a single point of authority.

Both are acceptable for MVP. Path to decentralization:
- Move earnings tracking on-chain (record milestone payments in a contract)
- Replace owner backstop with extended voting periods or reduced quorum on retry

---

## 9. Migration & Integration Plan

### Phase 1: Smart Contracts

1. Implement `EliteToken.sol` (soulbound ERC20Votes, UUPS upgradeable)
2. Implement `DisputeDAO.sol` (dispute lifecycle, UUPS upgradeable)
3. Write Foundry tests for full dispute lifecycle
4. Deploy both contracts
5. Call `EscrowVault.setDisputeDAO(disputeDAOAddress)` to authorize

### Phase 2: Backend

1. Build token sync service (recalculate voting power on milestone/review events → mint/burn)
2. Create migration 005 (disputes + dispute_votes tables)
3. Create/extend event listener for DisputeDAO events
4. Implement dispute API routes

### Phase 3: Frontend

1. Add dispute creation flow (modal from project detail page)
2. Build dispute detail page with timeline and voting interface
3. Add active disputes list and developer voting dashboard
4. Add dispute status to project cards and sidebars

### Phase 4: ProjectManager Integration (Future)

Add `onlyDisputeDAO` modifier to ProjectManager via contract upgrade, removing dependency on backend for project state changes during disputes.

---

## 10. Resolved Design Decisions

All open questions have been resolved:

| Question | Decision |
|----------|----------|
| Minimum dispute value | **No minimum**. Any dispute can be filed as long as the 50 USDC fee is paid |
| Evidence format | **PDF/DOCX/Markdown documents** uploaded via frontend, stored on IPFS |
| Appeal mechanism | **Not implemented** in v1. May be added in future upgrade |
| Partial resolution | **Not implemented** in v1. Binary outcomes only (100% client or 100% developer) |
| Voting incentive | **Yes**. Voters receive a small EliteToken reward after dispute resolves |

---

## 11. Comparison with Alternatives

| System | Who Votes | Vote Weight | Incentive | Privacy | Cost |
|--------|-----------|-------------|-----------|---------|------|
| **0xElite (this RFC)** | All active developers | Soulbound token (earnings × reputation) | Platform health (self-interest) | Public | 50 USDC fee |
| **Kleros** | Self-selected jurors | PNK token stake | Stake + slash | Public | Variable |
| **Aragon Court** | Random jurors weighted by ANJ | ANJ stake amount | Stake + slash | Commit-reveal | Subscription |
| **OpenZeppelin Governor** | All token holders | Token balance | None (governance duty) | Public | Gas only |
| **Traditional escrow** | Platform admin | N/A | Reputation | N/A | % of transaction |

Our design is closest to OpenZeppelin Governor (all members vote, token-weighted, public) but specialized for dispute resolution rather than protocol governance.

---

## 12. References

- EscrowVault contract: `contracts/contracts/EscrowVault.sol` (freeze/resolveDispute implemented)
- ProjectManager contract: `contracts/contracts/ProjectManager.sol`
- StakeVault contract: `contracts/contracts/StakeVault.sol`
- Event listener: `backend/src/services/escrowEventListener.ts`
- Escrow DB schema: `backend/src/db/migrations/003_create_escrow_tables.sql`
- RFC-001: Data Sync Strategy
- RFC-002: On-chain Storage Decisions
- [OpenZeppelin Governor](https://docs.openzeppelin.com/contracts/5.x/governance)
- [OpenZeppelin ERC20Votes](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#ERC20Votes)
- [Kleros Documentation](https://kleros.io/whitepaper.pdf)
- Project plan Spec 4: `0xElite-ProjectPlan.md` (lines 156-185, 903-1121)
