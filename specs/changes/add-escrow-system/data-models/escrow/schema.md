# Escrow

## Purpose

Tracks escrow deposits and current status for each project, providing quick access to escrow balance and freeze state.

## Schema

## ADDED Entities

### Entity: Escrow

Stores escrow information for projects including deposit amounts, released amounts, and freeze status.

**Table**: `escrow_deposits`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, NOT NULL | Unique escrow record identifier |
| `project_id` | UUID | UNIQUE, NOT NULL, FOREIGN KEY → projects(id) ON DELETE CASCADE | Associated project (1:1 relationship) |
| `contract_project_id` | BIGINT | NOT NULL | On-chain project ID in EscrowVault contract |
| `total_deposited` | DECIMAL(20,6) | NOT NULL, CHECK (total_deposited >= 0) | Total USDC deposited into escrow |
| `total_released` | DECIMAL(20,6) | NOT NULL, DEFAULT 0, CHECK (total_released >= 0) | Total USDC released (developers + fees) |
| `escrow_balance` | DECIMAL(20,6) | NOT NULL, GENERATED ALWAYS AS (total_deposited - total_released) STORED | Remaining USDC in escrow (computed) |
| `is_frozen` | BOOLEAN | NOT NULL, DEFAULT false | Whether escrow is frozen due to dispute |
| `frozen_at` | TIMESTAMP | NULL | When escrow was frozen |
| `frozen_by` | VARCHAR(42) | NULL | Address that initiated freeze (admin/dispute contract) |
| `deposit_tx_hash` | VARCHAR(66) | NULL | Blockchain transaction hash for initial deposit |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Escrow creation time |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update time |

**Indexes**:
- `idx_escrow_project` ON `project_id` UNIQUE (one escrow per project)
- `idx_escrow_contract_project` ON `contract_project_id` (for event matching)
- `idx_escrow_frozen` ON `is_frozen` (quickly find frozen escrows)

**Relationships**:
```typescript
Escrow {
  belongsTo: [Project]
  hasMany: [PaymentHistory]
}
```

**Triggers**:
```sql
-- Auto-update timestamp
CREATE TRIGGER update_escrow_timestamp
BEFORE UPDATE ON escrow_deposits
FOR EACH ROW EXECUTE FUNCTION update_timestamp();
```

## Validation Rules

### Rule: Balance Integrity

- **MUST** have `total_released <= total_deposited` (cannot release more than deposited)
- **MUST** have `escrow_balance >= 0` at all times
- **SHOULD** match on-chain escrow balance (verified via events)

### Rule: Freeze State

- **MUST NOT** allow releases while `is_frozen = true`
- **MUST** set `frozen_at` and `frozen_by` when freezing
- **SHOULD** only be frozen by authorized addresses (dispute contract, admin)

### Rule: Deposit Uniqueness

- **MUST** have exactly one escrow record per project
- **MUST** create escrow record before any releases
- **MUST** link to valid contract_project_id

## Related Specs

- **Capabilities**: `capabilities/escrow-management/spec.md`
- **APIs**: `api/escrow-management/spec.md`
- **Data Models**: `data-models/project/schema.md`, `data-models/payment-history/schema.md`
