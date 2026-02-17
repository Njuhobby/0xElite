# RFC-002: On-chain Data Storage Decision Framework

| Field       | Value                                   |
|-------------|-----------------------------------------|
| RFC         | 002                                     |
| Title       | On-chain Data Storage Decision Framework |
| Author      | 0xElite Team                            |
| Status      | Accepted                                |
| Created     | 2026-02-17                              |
| Updated     | 2026-02-17                              |

---

## 1. Context

0xElite uses both smart contracts and a traditional backend. Every piece of data in the system needs a home — either on-chain (smart contract storage), off-chain (PostgreSQL), or both.

Storing data on-chain is expensive (gas costs) and permanent (cannot be deleted). Storing data off-chain is cheap and flexible but requires users to trust the platform operator.

This RFC establishes a decision framework for making these choices consistently across current and future features.

---

## 2. Problem Statement

Without a clear framework, each feature risks ad-hoc decisions about what goes on-chain. This leads to:

- Over-storing on-chain: unnecessary gas costs, storing data that doesn't benefit from immutability
- Under-storing on-chain: critical data that should be trustless ends up centralized
- Inconsistency: similar data types handled differently across features

---

## 3. Decision Framework

For each piece of data, ask these three questions in order:

### Question 1: Does this data control or represent money/assets?

```
YES → Must be on-chain

Examples:
  ✅ Escrow deposit amounts
  ✅ Stake balances
  ✅ Token ownership
  ✅ Payment release records
  ✅ Fee calculations
```

**Rationale**: Financial data is the core trust proposition of blockchain. If users can't verify how much money is locked, the platform offers no advantage over a traditional escrow service.

### Question 2: If the platform operator tampers with this data, can users be harmed?

```
YES → Should be on-chain (or hash on-chain)

Examples:
  ✅ Client/developer address assignment (determines who gets paid)
  ✅ Project status (determines whether funds can be released)
  ✅ Dispute voting results (determines fund distribution)
  ✅ Milestone completion approval (triggers payment)

  ❌ Developer bio (tampering is annoying but not harmful)
  ❌ Project description text (no financial impact)
  ❌ User preferences (no financial impact)
```

**Rationale**: Data that can be weaponized against users must be tamper-proof. Data that is merely informational does not need this guarantee.

### Question 3: Do users need to verify or use this data without depending on our platform?

```
YES → Must be on-chain

Examples:
  ✅ "Is my escrow still funded?" (user can check independently)
  ✅ "Am I still assigned to this project?" (user can verify)
  ✅ "What are the contract rules?" (code is law)

  ❌ "What projects match my skills?" (requires our algorithm)
  ❌ "What's my notification history?" (platform-specific)
```

**Rationale**: If our platform disappears, users should still be able to interact with their funds and verify their state through the blockchain directly.

---

## 4. Classification: On-chain, Off-chain, or Hybrid

Based on the three questions, data falls into one of these categories:

### Category A: Must Be On-chain

All three questions answer YES. This data must live in smart contract storage.

| Data | Contract | Justification |
|------|----------|---------------|
| Escrow deposit amounts | EscrowVault | Controls money |
| Escrow released amounts | EscrowVault | Controls money |
| Escrow frozen/disputed status | EscrowVault | Determines if funds are locked |
| Stake amounts per developer | StakeVault | Controls money |
| Project client address | ProjectManager | Determines who receives refunds |
| Project developer address | ProjectManager | Determines who receives payment |
| Project status (Draft/Active/Completed/Disputed) | ProjectManager | Controls fund release eligibility |
| Project total budget | ProjectManager | Verifiable against escrow deposit |
| Dispute resolution outcome (shares) | EscrowVault | Directly distributes money |

### Category B: Off-chain Only

None of the three questions answer YES. This data lives in PostgreSQL only.

| Data | Table | Justification |
|------|-------|---------------|
| Developer email | developers | Private, no financial impact |
| Developer bio/about | developers | Informational only |
| Developer GitHub username | developers | Informational only |
| Developer hourly rate | developers | Display only, actual payment is on-chain |
| Developer availability (available/busy/vacation) | developers | Matching convenience |
| Project title | projects | Display only |
| Project detailed description | projects | Display only, too large for chain |
| Project required skills | projects | Matching algorithm input |
| Project timeline/deadline | projects | Display only |
| Chat messages between client/developer | messages (future) | Too much data, privacy needed |
| User notification preferences | settings (future) | Platform-specific |
| Search history | N/A | Ephemeral |
| Matching algorithm weights | system config | Trade secret |

### Category C: Hybrid (On-chain Anchor + Off-chain Detail)

Question 2 is a soft YES — tampering could matter but full on-chain storage is impractical. Solution: store a **hash or reference** on-chain, full content off-chain.

| Data | On-chain | Off-chain | Justification |
|------|----------|-----------|---------------|
| Milestone definitions | Hash of milestone spec (future) | Full milestone details in PostgreSQL | Milestone text can be long, but completion triggers payment. Hash allows verification without on-chain bloat. |
| Reviews/ratings | Hash of review (future, Spec 5) | Full review text in PostgreSQL | Reviews affect reputation. Hash on-chain proves review wasn't edited after submission. |
| Project requirements document | IPFS CID on-chain (future) | Full document on IPFS | Large documents can't go on-chain. IPFS + CID ensures immutability. |

---

## 5. Decisions for Current Features

### Spec 1: Developer Registration & Staking

| Data | Decision | Location |
|------|----------|----------|
| Wallet address | On-chain | StakeVault (implicit via mapping) |
| Stake amount | On-chain | StakeVault.stakes[address] |
| Stake timestamp | On-chain | StakeVault.stakedAt[address] |
| Required stake amount | On-chain | StakeVault.requiredStake |
| Email, GitHub, bio, skills, rate | Off-chain | developers table |
| Developer status (pending/active/suspended) | Off-chain | developers table |

**Note on developer status**: Currently off-chain. The stakeListener automatically sets status to 'active' when a Staked event is detected. This is acceptable for MVP, but a more decentralized approach would derive status from on-chain data (has stake >= required → active).

### Spec 2: Project Submission & Matching

| Data | Decision | Location |
|------|----------|----------|
| Client address | On-chain | ProjectManager.projects[id].client |
| Developer address | On-chain | ProjectManager.projects[id].assignedDeveloper |
| Project status | On-chain | ProjectManager.projects[id].state |
| Total budget | On-chain | ProjectManager.projects[id].totalBudget |
| Project title, description, skills | Off-chain | projects table |
| Matching algorithm results | Off-chain | Computed at query time |

### Spec 3: Escrow System

| Data | Decision | Location |
|------|----------|----------|
| Deposit amount | On-chain | EscrowVault.escrows[id].totalAmount |
| Released amount | On-chain | EscrowVault.escrows[id].releasedAmount |
| Disputed/frozen status | On-chain | EscrowVault.escrows[id].disputed |
| Client address | On-chain | EscrowVault.escrows[id].client |
| Payment history (aggregated) | Off-chain | payment_history table (indexed from events) |
| Milestone details | Off-chain | milestones table |

### Spec 5: Reviews & Ratings (Proposed)

| Data | Decision | Location |
|------|----------|----------|
| Review text | Off-chain | reviews table |
| Rating (1-5) | Off-chain | reviews table |
| Average rating | Off-chain | developers table (computed) |
| Review hash | On-chain (future) | For tamper-proofing |

---

## 6. Cost Analysis

Approximate gas costs for storing data on-chain (Ethereum L1, estimates):

| Operation | Gas | Cost at 30 gwei, $2000 ETH |
|-----------|-----|------------------------------|
| Store one uint256 (32 bytes) | ~20,000 | ~$1.20 |
| Store one address (20 bytes) | ~20,000 | ~$1.20 |
| Store a struct (5 fields) | ~100,000 | ~$6.00 |
| Store 1KB of text | ~640,000 | ~$38.40 |
| Store 10KB of text | ~6,400,000 | ~$384.00 |

This is why project descriptions (potentially several KB) should NOT go on-chain. A project struct with ID, addresses, status, and budget (~5 fields) is reasonable at ~$6.

**On L2 chains (Arbitrum, Optimism)**: Costs are 10-100x cheaper, making more on-chain storage feasible.

---

## 7. Future Considerations

### IPFS for Large Immutable Content

For data that is too large for on-chain but needs immutability (project specs, review text), consider:

```
Content → IPFS → CID (hash)
CID → stored on-chain (cheap, just 32 bytes)
```

Users can verify: hash(IPFS content) == on-chain CID.

### Deriving Status from On-chain State

Currently, developer status is managed off-chain. A more decentralized approach:

```
Developer "active" = StakeVault.stakes[developer] >= StakeVault.requiredStake
```

No backend needed to determine if someone is an active developer. The frontend can derive it from chain data directly.

### Progressive Decentralization

As the platform matures:

1. **MVP**: Most data off-chain, only funds on-chain ← We are here
2. **Growth**: Critical state on-chain, direct reads for financial data
3. **Mature**: Hashes/CIDs on-chain for all important data, The Graph for indexing
4. **Full decentralization**: DAO controls upgrades, no single admin

---

## 8. Summary

The guiding principle is:

> **Put data on-chain when it protects users. Keep data off-chain when it serves the platform.**

Specifically:
- **Money** → always on-chain
- **Data that controls money** → always on-chain
- **Data users need to verify independently** → on-chain
- **Large content that needs immutability** → IPFS + hash on-chain
- **Everything else** → off-chain database

---

## 9. References

- [Ethereum Gas Costs](https://ethereum.org/en/developers/docs/gas/)
- [IPFS Documentation](https://docs.ipfs.tech/)
- [The Graph - Subgraph Best Practices](https://thegraph.com/docs/)
- RFC-001: On-chain and Off-chain Data Synchronization Strategy
- 0xElite Smart Contracts: `contracts/contracts/`
