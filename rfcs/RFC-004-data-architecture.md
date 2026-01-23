# RFC-004: Data Architecture - On-chain vs Off-chain

## Metadata
- **Status**: Accepted
- **Created**: 2026-01-23
- **Author**: @yihaojiang

## Background

In designing 0xElite, we need to decide what data lives on-chain (smart contracts) vs off-chain (backend database). This decision impacts:

- Gas costs
- System complexity
- User experience
- Decentralization level
- Data verifiability

## Problem Statement

1. What data MUST be on-chain for trustless operation?
2. What data CAN be off-chain without sacrificing core value proposition?
3. How do on-chain and off-chain data interact?

## Core Principle

**Only data that requires trustlessness should be on-chain.**

Trustlessness is needed when:
- Funds are involved (escrow, payments)
- Disputes need transparent resolution
- No single party should have control

Trustlessness is NOT needed when:
- Users already trust the platform for the service
- Data is subjective (ratings, reviews)
- Data changes frequently (availability, status)

## Proposed Architecture

### On-chain Data (Smart Contracts)

```
ProjectManager.sol + EscrowVault.sol
├── Project
│   ├── projectId
│   ├── client (address)
│   ├── developer (address)
│   ├── totalBudget
│   ├── releasedAmount
│   ├── status
│   └── milestones[]
│       ├── description (IPFS hash)
│       ├── amount
│       ├── deadline
│       ├── submitted
│       └── approved
│
└── Events
    ├── ProjectCreated(projectId, client, budget)
    ├── DeveloperAssigned(projectId, developer)
    ├── MilestoneSubmitted(projectId, milestoneIndex)
    ├── MilestoneCompleted(projectId, milestoneIndex, developer, amount)
    └── ProjectCompleted(projectId, developer, totalPaid)

DisputeDAO.sol
├── Dispute
│   ├── disputeId
│   ├── projectId
│   ├── initiator
│   ├── clientVotes
│   ├── developerVotes
│   └── status
│
└── Events
    ├── DisputeCreated(disputeId, projectId, initiator)
    ├── VoteCast(disputeId, arbiter, side)
    └── DisputeResolved(disputeId, winner, clientShare, developerShare)
```

### Derived On-chain Metrics

These metrics are NOT stored separately but can be computed from on-chain events:

| Metric | Derivation |
|--------|------------|
| `projectsCompleted` | `COUNT(ProjectCompleted WHERE developer = X)` |
| `totalEarned` | `SUM(MilestoneCompleted.amount WHERE developer = X)` |
| `onTimeDelivery` | `COUNT(MilestoneCompleted WHERE timestamp <= deadline) / total` |
| `disputesWon` | `COUNT(DisputeResolved WHERE winner = developer)` |
| `disputesLost` | `COUNT(DisputeResolved WHERE winner != developer AND developer was party)` |

**Key Insight**: These metrics are verifiable by anyone querying the blockchain, but we cache them in the backend for performance.

### Off-chain Data (Backend Database)

```
developers
├── walletAddress (PK)
├── email                    # For notifications
├── githubUsername           # Optional verification
├── skills[]                 # Self-declared
├── availability             # 'available' | 'busy' | 'vacation'
├── profileData              # Bio, avatar (IPFS hash)
├── stakeAmount              # Tracked off-chain, verified on-chain when needed
├── stakeDepositedAt
│
├── # Cached from on-chain (for query performance)
├── projectsCompleted
├── totalEarned
├── onTimeDeliveryRate
├── disputesWon
├── disputesLost
│
├── # Pure off-chain metrics
├── avgRating                # Subjective, from client reviews
├── ratingCount
├── rejectionCount           # Invitation rejections
├── lastActiveAt
└── currentProjectCount

projects (extended data)
├── projectId (PK, matches on-chain)
├── title
├── description              # Full text, or IPFS hash
├── requiredSkills[]
├── clientEmail
└── # Status synced from on-chain

invitations
├── invitationId
├── projectId
├── developerAddress
├── status                   # 'pending' | 'accepted' | 'rejected'
├── sentAt
└── respondedAt

reviews
├── reviewId
├── projectId
├── fromAddress              # Client
├── toAddress                # Developer
├── rating                   # 1-100
├── comment
└── createdAt
```

### What's NOT On-chain (and why)

| Data | Reason for Off-chain |
|------|---------------------|
| `avgRating` | Subjective; easily gamed if on-chain incentives exist |
| `rejectionCount` | Invitation system is off-chain |
| `skills[]` | Self-declared, changes frequently |
| `availability` | Real-time status, would be expensive to update on-chain |
| `email` | Private data |
| `profileData` | Large data, changes frequently |
| Matching algorithm | Complex computation, not suitable for on-chain |

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Project Lifecycle                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Client creates project                                          │
│     [Backend] Store project details                                 │
│     [Contract] createProject() + deposit funds                      │
│         └── emit ProjectCreated                                     │
│                                                                     │
│  2. Platform matches developer                                      │
│     [Backend] Run matching algorithm using cached reputation        │
│     [Backend] Send invitation (off-chain)                           │
│     [Backend] Developer accepts                                     │
│     [Contract] assignDeveloper()                                    │
│         └── emit DeveloperAssigned                                  │
│                                                                     │
│  3. Developer completes milestone                                   │
│     [Contract] submitMilestone(deliverableHash)                     │
│         └── emit MilestoneSubmitted                                 │
│                                                                     │
│  4. Client approves milestone                                       │
│     [Contract] approveMilestone()                                   │
│         └── EscrowVault.release()                                   │
│         └── emit MilestoneCompleted(developer, amount)              │
│     [Backend] Listen to event → update cached metrics               │
│     [Backend] Client submits rating (off-chain)                     │
│                                                                     │
│  5. Project completes                                               │
│     [Contract] emit ProjectCompleted                                │
│     [Backend] Update developer.projectsCompleted cache              │
│     [Backend] Recalculate reputation score                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Reputation Score Calculation

Reputation is calculated in the backend, combining on-chain verifiable data with off-chain platform data:

```typescript
function calculateReputationScore(developer: Developer): number {
  // === On-chain verifiable (cached in DB) ===
  const projectsCompleted = developer.projectsCompleted;
  const onTimeRate = developer.onTimeDeliveryRate;  // 0-1
  const disputesWon = developer.disputesWon;
  const disputesLost = developer.disputesLost;

  // === Off-chain only ===
  const avgRating = developer.avgRating;            // 0-100
  const rejectionCount = developer.rejectionCount;

  // === Calculation ===
  let score = 0;

  score += projectsCompleted * 10;      // +10 per completed project
  score += avgRating * 2;               // Up to +200 for perfect rating
  score += onTimeRate * 50;             // Up to +50 for 100% on-time
  score += disputesWon * 5;             // +5 per dispute won
  score -= rejectionCount * 3;          // -3 per rejection
  score -= disputesLost * 20;           // -20 per dispute lost

  return Math.max(0, score);
}
```

**Transparency**: The on-chain components of this score can be independently verified by querying the blockchain.

## Smart Contract Design

### Contracts Required

| Contract | Responsibility |
|----------|---------------|
| `ProjectManager.sol` | Project lifecycle, milestone tracking, developer assignment |
| `EscrowVault.sol` | Fund custody, milestone-based release, dispute freezing |
| `DisputeDAO.sol` | Dispute creation, voting, resolution, fund distribution |

### What We're NOT Building

| Originally Planned | Decision | Reason |
|-------------------|----------|--------|
| `MembershipNFT.sol` | Removed | Membership can be tracked off-chain; optional NFT can be added later |
| `ReputationSBT.sol` | Removed | Reputation metrics derivable from project events; no separate storage needed |
| `Treasury.sol` | Simplified | Platform fees can be sent directly to a multisig; no complex contract needed |

## Consequences

### Benefits

1. **Reduced gas costs** - Only essential transactions on-chain
2. **Simpler contracts** - 3 contracts instead of 6-7
3. **Flexible iteration** - Off-chain logic easy to update
4. **Better UX** - Fast queries from database
5. **Verifiable core** - Critical metrics still on-chain verifiable

### Trade-offs

1. **Partial centralization** - Platform controls off-chain data
2. **Trust requirement** - Users trust platform for ratings, matching
3. **Sync complexity** - Must keep cache in sync with chain

### Mitigations

1. Reputation core inputs are on-chain verifiable
2. Dispute resolution is fully on-chain (trustless)
3. Funds always protected by smart contracts
4. Future option: publish merkle root of off-chain data periodically

## Backend Sync Strategy

```typescript
// 1. Historical sync on startup
async function syncHistoricalEvents() {
  const events = await projectManager.queryFilter('*', 0, 'latest');
  for (const event of events) {
    await processEvent(event);
  }
}

// 2. Real-time listener
function startEventListeners() {
  projectManager.on('MilestoneCompleted', async (projectId, milestoneIndex, developer, amount) => {
    await db.developers.increment(developer, 'totalEarned', amount);
    await recalculateReputation(developer);
  });

  projectManager.on('ProjectCompleted', async (projectId, developer) => {
    await db.developers.increment(developer, 'projectsCompleted', 1);
    await recalculateReputation(developer);
  });

  disputeDAO.on('DisputeResolved', async (disputeId, winner, ...) => {
    // Update disputesWon/Lost for relevant parties
  });
}

// 3. Periodic verification
async function verifyDataIntegrity() {
  const developers = await db.developers.findAll();
  for (const dev of developers) {
    const onChainCount = await countProjectsFromEvents(dev.walletAddress);
    if (dev.projectsCompleted !== onChainCount) {
      logger.warn(`Mismatch for ${dev.walletAddress}: DB=${dev.projectsCompleted}, Chain=${onChainCount}`);
      await db.developers.update(dev.walletAddress, { projectsCompleted: onChainCount });
    }
  }
}
```

## Open Questions

1. Should we store IPFS hashes of project descriptions on-chain for immutability?
2. How often should we run data integrity verification?
3. Should ratings be optionally publishable on-chain (user choice)?

## References

- RFC-001: Identity and Login System
- RFC-002: Sybil Prevention Mechanism
- RFC-003: Task Assignment and Rejection Policy
- [The Graph](https://thegraph.com/) - Potential future indexing solution
