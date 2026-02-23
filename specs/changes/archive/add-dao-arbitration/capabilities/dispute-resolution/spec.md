# Dispute Resolution

## Purpose

Provides a decentralized, community-driven dispute resolution mechanism for resolving disagreements between clients and developers over milestone completion, enabling all active developers to vote on outcomes with reputation-weighted voting power.

## Requirements

## ADDED Requirements

### Requirement: Dispute Initiation

The system SHALL allow either party (client or developer) to file a dispute on a project that is in `assigned` or `in_progress` status, provided the project is not already disputed.

#### Scenario: Client files dispute on in-progress project

- **WHEN** a client calls createDispute with a valid projectId and evidence IPFS URI
- **THEN** the system transfers 50 USDC arbitration fee from the client
- **AND** the system freezes the project escrow via EscrowVault.freeze()
- **AND** the system creates a dispute with status "open" and evidence deadline set to 3 days from now
- **AND** the system emits a DisputeCreated event

#### Scenario: Developer files dispute on assigned project

- **WHEN** a developer calls createDispute with a valid projectId where they are the assigned developer
- **THEN** the system transfers 50 USDC arbitration fee from the developer
- **AND** the system freezes the project escrow
- **AND** the system creates a dispute with the developer as initiator

#### Scenario: Dispute filed on already-disputed project

- **WHEN** a user tries to file a dispute on a project that already has an active dispute
- **THEN** the system rejects the request

#### Scenario: Dispute filed by non-party

- **WHEN** a user who is neither the client nor the assigned developer tries to file a dispute
- **THEN** the system rejects the request

### Requirement: Evidence Submission

The system SHALL allow both parties to submit evidence documents (PDF, DOCX, or Markdown) during the 3-day evidence period.

#### Scenario: Client submits evidence during evidence period

- **WHEN** the client uploads a PDF/DOCX/MD document during the evidence period
- **THEN** the system stores the document on IPFS and records the CID on-chain
- **AND** the system emits an EvidenceSubmitted event

#### Scenario: Developer submits evidence during evidence period

- **WHEN** the developer uploads an evidence document during the evidence period
- **THEN** the system stores the document on IPFS and records the CID on-chain

#### Scenario: Evidence submitted after deadline

- **WHEN** a party tries to submit evidence after the evidence deadline has passed
- **THEN** the system rejects the submission

#### Scenario: Party updates their evidence

- **WHEN** a party submits new evidence, replacing their previous submission during the evidence period
- **THEN** the system updates the on-chain evidence URI to the new IPFS CID

### Requirement: Voting Phase Transition

The system SHALL allow anyone to trigger the transition from evidence period to voting period once the evidence deadline has passed.

#### Scenario: Start voting after evidence deadline

- **WHEN** any user calls startVoting after the evidence deadline has elapsed
- **THEN** the system sets the voting deadline to 5 days from now
- **AND** the system takes a snapshot of EliteToken balances at the current timestamp
- **AND** the system changes dispute status from "open" to "voting"
- **AND** the system emits a VotingStarted event

#### Scenario: Start voting before evidence deadline

- **WHEN** a user tries to start voting before the evidence deadline
- **THEN** the system rejects the request

### Requirement: Reputation-Weighted Voting

The system SHALL allow all eligible active developers to cast a weighted vote during the 5-day voting period, where vote weight equals their EliteToken balance at the voting snapshot.

#### Scenario: Eligible developer casts vote supporting client

- **WHEN** an active developer with voting power > 0 who is not a dispute party calls castVote with supportClient=true
- **THEN** the system records the vote with weight equal to their EliteToken balance at the snapshot
- **AND** the system adds the weight to clientVoteWeight
- **AND** the system emits a VoteCast event

#### Scenario: Eligible developer casts vote supporting developer

- **WHEN** an active developer calls castVote with supportClient=false
- **THEN** the system records the vote and adds weight to developerVoteWeight

#### Scenario: Developer with zero voting power attempts to vote

- **WHEN** a developer with zero EliteToken balance at the snapshot tries to vote
- **THEN** the system rejects the vote

#### Scenario: Dispute party attempts to vote

- **WHEN** the client or assigned developer of the disputed project tries to vote
- **THEN** the system rejects the vote

#### Scenario: Developer attempts to vote twice

- **WHEN** a developer who has already voted on a dispute tries to vote again
- **THEN** the system rejects the second vote

#### Scenario: Vote cast after voting deadline

- **WHEN** a developer tries to vote after the voting deadline has passed
- **THEN** the system rejects the vote

### Requirement: Dispute Resolution with Quorum

The system SHALL resolve a dispute by simple majority when at least 25% of total EliteToken supply has participated in voting.

#### Scenario: Quorum reached and client wins

- **WHEN** the voting deadline has passed and totalVoteWeight >= 25% of EliteToken total supply and clientVoteWeight > developerVoteWeight
- **THEN** the system distributes 100% of remaining escrow to the client via EscrowVault.resolveDispute()
- **AND** the system refunds the 50 USDC arbitration fee to the initiator if the client initiated, or transfers it to platform treasury if the developer initiated
- **AND** the system marks the dispute as resolved with clientWon=true
- **AND** the system emits a DisputeResolved event

#### Scenario: Quorum reached and developer wins

- **WHEN** the voting deadline has passed and quorum is met and developerVoteWeight > clientVoteWeight
- **THEN** the system distributes 100% of remaining escrow to the developer
- **AND** the system refunds the arbitration fee to the initiator if the developer initiated
- **AND** the system marks the dispute as resolved with clientWon=false

#### Scenario: Quorum not reached

- **WHEN** the voting deadline has passed and totalVoteWeight < 25% of EliteToken total supply
- **THEN** the system does NOT automatically resolve the dispute
- **AND** the system waits for the platform owner to call ownerResolve

### Requirement: Owner Resolution Backstop

The system SHALL allow the platform owner to resolve a dispute when the voting quorum is not met.

#### Scenario: Owner resolves dispute after quorum failure

- **WHEN** the voting deadline has passed and quorum was not met and the owner calls ownerResolve
- **THEN** the system distributes escrow funds according to the owner's decision
- **AND** the system marks the dispute as resolvedByOwner=true
- **AND** the system emits a DisputeResolvedByOwner event

#### Scenario: Owner tries to resolve when quorum was met

- **WHEN** the owner calls ownerResolve but the quorum was already met
- **THEN** the system rejects the request (must use executeResolution instead)

### Requirement: Arbitration Fee

The system SHALL charge a 50 USDC arbitration fee from the dispute initiator, refunding it if the initiator's side wins.

#### Scenario: Initiator wins — fee refunded

- **WHEN** a dispute resolves and the initiator's side wins
- **THEN** the system refunds 50 USDC to the initiator

#### Scenario: Initiator loses — fee kept

- **WHEN** a dispute resolves and the initiator's side loses
- **THEN** the 50 USDC fee is transferred to the platform treasury

### Requirement: Voting Power Calculation

The system SHALL calculate each developer's voting power as `total_earned × (average_rating / 5.0)` and represent it as a soulbound (non-transferable) EliteToken balance.

#### Scenario: Developer completes milestone and voting power increases

- **WHEN** a developer receives a milestone payment of $5,000 and has a 4.0 average rating
- **THEN** the backend recalculates voting power as `total_earned × (4.0 / 5.0)`
- **AND** the backend mints or burns EliteToken to match the new voting power

#### Scenario: Developer receives new review and voting power changes

- **WHEN** a developer receives a new review that changes their average rating
- **THEN** the backend recalculates voting power with the updated rating
- **AND** the backend mints or burns EliteToken to match

#### Scenario: New developer with no completed projects

- **WHEN** a developer has $0 total earnings or no rating
- **THEN** their voting power is 0 and they cannot vote on disputes

### Requirement: Voting Participation Reward

The system SHALL mint a small amount of EliteToken to voters who participate in dispute resolution, as a reward after the dispute resolves.

#### Scenario: Voter receives participation reward

- **WHEN** a dispute resolves (by quorum or owner decision)
- **THEN** the backend mints a participation reward to each voter who cast a vote
- **AND** the reward amount is determined by platform configuration

### Requirement: No Minimum Escrow Balance for Disputes

The system SHALL allow disputes to be filed regardless of the remaining escrow balance, as long as the 50 USDC arbitration fee is paid.

#### Scenario: Dispute filed with minimal escrow remaining

- **WHEN** a project has only $10 remaining in escrow but a party pays the 50 USDC fee
- **THEN** the system creates the dispute normally

## Related Specs

- **Data Models**: `data-models/dispute/schema.md`, `data-models/dispute-vote/schema.md`
- **APIs**: `api/dispute-management/spec.md`
- **Architecture**: `architecture/dispute-dao-contract/spec.md`, `architecture/elite-token-contract/spec.md`, `architecture/dispute-event-listener/spec.md`
