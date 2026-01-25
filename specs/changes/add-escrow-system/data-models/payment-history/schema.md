# Payment History

## Purpose

Provides complete audit trail of all escrow transactions including deposits, releases, fee collections, freezes, and dispute resolutions.

## Schema

## ADDED Entities

### Entity: PaymentHistory

Immutable log of all escrow-related transactions for auditability and transparency.

**Table**: `payment_history`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, NOT NULL | Unique transaction record identifier |
| `project_id` | UUID | NOT NULL, FOREIGN KEY → projects(id) ON DELETE CASCADE | Associated project |
| `milestone_id` | UUID | NULL, FOREIGN KEY → milestones(id) ON DELETE SET NULL | Associated milestone (NULL for deposits/disputes) |
| `transaction_type` | VARCHAR(20) | NOT NULL | Type: deposit, release, fee_collection, freeze, unfreeze, dispute_resolution |
| `amount` | DECIMAL(20,6) | NOT NULL, CHECK (amount > 0) | Transaction amount in USDC |
| `from_address` | VARCHAR(42) | NOT NULL | Source address (client for deposit, escrow for releases) |
| `to_address` | VARCHAR(42) | NOT NULL | Destination address (escrow for deposit, developer/treasury for releases) |
| `tx_hash` | VARCHAR(66) | NOT NULL, UNIQUE | Blockchain transaction hash |
| `block_number` | BIGINT | NOT NULL | Block number when transaction occurred |
| `block_timestamp` | TIMESTAMP | NOT NULL | Block timestamp (authoritative time) |
| `platform_fee` | DECIMAL(20,6) | NULL | Platform fee amount if applicable (for releases) |
| `developer_payment` | DECIMAL(20,6) | NULL | Developer payment amount if applicable (for releases) |
| `notes` | TEXT | NULL | Additional context (e.g., dispute resolution outcome) |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | When record was created in database |

**Indexes**:
- `idx_payment_project` ON `project_id` (fetch all payments for a project)
- `idx_payment_milestone` ON `milestone_id` (find payment for specific milestone)
- `idx_payment_tx_hash` ON `tx_hash` UNIQUE (prevent duplicate processing)
- `idx_payment_type` ON `transaction_type` (filter by transaction type)
- `idx_payment_timestamp` ON `block_timestamp` DESC (chronological ordering)

**Relationships**:
```typescript
PaymentHistory {
  belongsTo: [Project, Milestone (optional), Escrow]
  hasMany: []
}
```

**Transaction Types**:
```
deposit            - Client deposits funds into escrow
release            - Milestone payment released to developer
fee_collection     - Platform fee sent to treasury
freeze             - Escrow frozen due to dispute
unfreeze           - Escrow unfrozen after dispute resolution
dispute_resolution - Funds distributed after dispute ruling
```

## Validation Rules

### Rule: Immutability

- **MUST NOT** allow updates to payment_history records (insert-only table)
- **MUST NOT** allow deletions (except CASCADE on project deletion)
- **SHOULD** use database triggers to enforce immutability

### Rule: Transaction Integrity

- **MUST** have unique tx_hash (prevent duplicate event processing)
- **MUST** have valid from_address and to_address (42-char hex with 0x prefix)
- **MUST** have amount > 0 for all transaction types
- **MUST** link to existing project_id

### Rule: Type-Specific Fields

- **MUST** set platform_fee and developer_payment for "release" transactions
- **MUST** set milestone_id for "release" and "fee_collection" transactions
- **MAY** leave milestone_id NULL for "deposit", "freeze", "unfreeze", "dispute_resolution"
- **SHOULD** populate notes for "dispute_resolution" transactions

### Rule: Chronological Ordering

- **MUST** have block_timestamp in ascending order for same project
- **MUST** use block_timestamp (not created_at) for authoritative ordering
- **SHOULD** process events in block order to maintain consistency

## Related Specs

- **Capabilities**: `capabilities/escrow-management/spec.md`
- **APIs**: `api/escrow-management/spec.md`
- **Data Models**: `data-models/escrow/schema.md`, `data-models/project/schema.md`, `data-models/milestone/schema.md`
