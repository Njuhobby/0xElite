# Dispute Vote

## Purpose

Stores individual votes cast by developers in dispute resolution, including vote direction, weight, and transaction reference.

## Schema

## ADDED Entities

### Entity: DisputeVote

Represents a single developer's vote on a dispute, recording their choice (support client or developer) and the weight of their vote based on their EliteToken balance at the voting snapshot.

**Table**: `dispute_votes`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, NOT NULL, DEFAULT gen_random_uuid() | Unique identifier |
| `dispute_id` | UUID | NOT NULL, REFERENCES disputes(id) | The dispute being voted on |
| `voter_address` | VARCHAR(42) | NOT NULL | Wallet address of the voter |
| `support_client` | BOOLEAN | NOT NULL | True if voting for client, false if voting for developer |
| `vote_weight` | DECIMAL(20,6) | NOT NULL | EliteToken balance at voting snapshot |
| `reward_amount` | DECIMAL(20,6) | NULL | Participation reward minted after resolution |
| `tx_hash` | VARCHAR(66) | NULL | On-chain transaction hash of the vote |
| `voted_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | When the vote was cast |

**Indexes**:
- `idx_dispute_votes_dispute` ON `dispute_id` (list votes for a dispute)
- `idx_dispute_votes_voter` ON `voter_address` (list disputes a developer voted on)
- UNIQUE(`dispute_id`, `voter_address`) (one vote per developer per dispute)

**Relationships**:
```typescript
DisputeVote {
  belongsTo: [Dispute]
}
```

## Validation Rules

### Rule: One Vote Per Dispute

- **MUST** enforce UNIQUE(dispute_id, voter_address) — each developer votes at most once per dispute

### Rule: Positive Vote Weight

- **MUST** ensure vote_weight > 0 (developers with zero voting power cannot vote)

### Rule: Voter Not a Party

- **MUST** ensure voter_address is neither the client nor the developer of the disputed project

## Related Specs

- **Capabilities**: `capabilities/dispute-resolution/spec.md`
- **Data Models**: `data-models/dispute/schema.md`
