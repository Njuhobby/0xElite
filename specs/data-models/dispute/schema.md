# Dispute

## Purpose

Stores dispute records including lifecycle state, evidence URIs, voting tallies, and resolution outcomes for the DAO arbitration system.

## Schema

### Entity: Dispute

Represents a dispute filed by either a client or developer on a project, tracking the full lifecycle from initiation through evidence submission, voting, and resolution.

**Table**: `disputes`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, NOT NULL, DEFAULT gen_random_uuid() | Unique identifier |
| `dispute_number` | SERIAL | NOT NULL | Auto-incrementing human-readable dispute number |
| `project_id` | UUID | NOT NULL, REFERENCES projects(id) | The disputed project |
| `client_address` | VARCHAR(42) | NOT NULL | Client wallet address |
| `developer_address` | VARCHAR(42) | NOT NULL | Developer wallet address |
| `initiator_address` | VARCHAR(42) | NOT NULL | Address of the party who filed the dispute |
| `initiator_role` | VARCHAR(20) | NOT NULL, CHECK (IN ('client', 'developer')) | Role of the initiator |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT 'open', CHECK (IN ('open', 'voting', 'resolved')) | Current dispute phase |
| `client_evidence_uri` | VARCHAR(500) | NULL | IPFS CID for client evidence document |
| `developer_evidence_uri` | VARCHAR(500) | NULL | IPFS CID for developer evidence document |
| `evidence_deadline` | TIMESTAMP | NOT NULL | End of evidence submission period |
| `voting_deadline` | TIMESTAMP | NULL | End of voting period (set when voting starts) |
| `voting_snapshot` | TIMESTAMP | NULL | Timestamp for EliteToken balance snapshot |
| `client_vote_weight` | DECIMAL(20,6) | NOT NULL, DEFAULT 0 | Accumulated weighted votes supporting client |
| `developer_vote_weight` | DECIMAL(20,6) | NOT NULL, DEFAULT 0 | Accumulated weighted votes supporting developer |
| `total_vote_weight` | DECIMAL(20,6) | NOT NULL, DEFAULT 0 | Total weight of all votes cast |
| `quorum_required` | DECIMAL(20,6) | NULL | 25% of total EliteToken supply at voting snapshot |
| `winner` | VARCHAR(20) | NULL, CHECK (IN ('client', 'developer')) | Winning party after resolution |
| `resolved_by_owner` | BOOLEAN | NOT NULL, DEFAULT false | True if owner resolved due to quorum failure |
| `client_share` | DECIMAL(20,6) | NULL | USDC amount distributed to client |
| `developer_share` | DECIMAL(20,6) | NULL | USDC amount distributed to developer |
| `arbitration_fee` | DECIMAL(20,6) | NOT NULL, DEFAULT 50.000000 | Fee paid by initiator |
| `chain_dispute_id` | INTEGER | NULL | On-chain dispute ID from DisputeDAO contract |
| `creation_tx_hash` | VARCHAR(66) | NULL | Transaction hash of dispute creation |
| `resolution_tx_hash` | VARCHAR(66) | NULL | Transaction hash of resolution |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Record creation time |
| `resolved_at` | TIMESTAMP | NULL | When the dispute was resolved |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update time |

**Indexes**:
- `idx_disputes_project` ON `project_id` (lookup by project)
- `idx_disputes_status` ON `status` (filter by phase)
- `idx_disputes_initiator` ON `initiator_address` (lookup by initiator)
- `idx_disputes_chain_id` ON `chain_dispute_id` (lookup by on-chain ID)

**Relationships**:
```typescript
Dispute {
  belongsTo: [Project]
  hasMany: [DisputeVote]
}
```

## Validation Rules

### Rule: One Active Dispute Per Project

- **MUST** ensure only one dispute with status 'open' or 'voting' exists per project at a time

### Rule: Status Transitions

- **MUST** only allow transitions: open -> voting -> resolved
- **MUST NOT** allow reverting to a previous status

### Rule: Initiator Must Be Party

- **MUST** ensure initiator_address matches either client_address or developer_address

## Related Specs

- **Capabilities**: `capabilities/dispute-resolution/spec.md`
- **APIs**: `api/dispute-management/spec.md`
- **Architecture**: `architecture/dispute-dao-contract/spec.md`
