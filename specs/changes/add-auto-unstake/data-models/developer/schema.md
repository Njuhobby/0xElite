# Developer (Unlock Fields Delta)

## Purpose

Extends the developer data model with fields to track gradual stake unlock progress and history.

## MODIFIED Entities

### Entity: Developer

**Table**: `developers`

**Added Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `unlock_tier` | SMALLINT | NOT NULL, DEFAULT 0, CHECK (0-4) | Current unlock tier reached. 0 = no unlocks, 4 = fully unlocked |
| `total_unlocked` | DECIMAL(20,6) | NOT NULL, DEFAULT 0 | Cumulative USDC unlocked to date |
| `last_unlock_at` | TIMESTAMP | NULL | Timestamp of most recent unlock |

**Tier Mapping**:

| unlock_tier | projects_completed threshold | cumulative unlocked | remaining stake |
|-------------|------------------------------|---------------------|-----------------|
| 0           | < 5                          | 0                   | 200 USDC        |
| 1           | >= 5                         | 50                  | 150 USDC        |
| 2           | >= 10                        | 100                 | 100 USDC        |
| 3           | >= 15                        | 150                 | 50 USDC         |
| 4           | >= 20                        | 200                 | 0 USDC          |

## ADDED Entities

### Entity: UnlockHistory

Records each automatic unlock event for audit trail and developer visibility.

**Table**: `unlock_history`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, NOT NULL, DEFAULT gen_random_uuid() | Unique identifier |
| `developer_address` | VARCHAR(42) | NOT NULL, REFERENCES developers(wallet_address) | Developer who received the unlock |
| `amount` | DECIMAL(20,6) | NOT NULL | USDC amount unlocked in this event |
| `from_tier` | SMALLINT | NOT NULL | Tier before this unlock |
| `to_tier` | SMALLINT | NOT NULL | Tier after this unlock |
| `tx_hash` | VARCHAR(66) | NOT NULL, UNIQUE | On-chain transaction hash of the unstakeFor call |
| `unlocked_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | When the unlock was executed |

**Indexes**:
- `idx_unlock_history_developer` ON `developer_address` (for per-developer queries)
- `idx_unlock_history_unlocked_at` ON `unlocked_at` (for chronological sorting)
- `idx_unlock_history_tx_hash` ON `tx_hash` (UNIQUE, for deduplication)

**Relationships**:
```
UnlockHistory {
  belongsTo: Developer (via developer_address → developers.wallet_address)
}

Developer {
  hasMany: UnlockHistory
}
```

## Migration

**File**: `backend/src/db/migrations/008_add_unlock_tracking.sql`

```sql
-- Add unlock tracking fields to developers
ALTER TABLE developers ADD COLUMN IF NOT EXISTS unlock_tier SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS total_unlocked DECIMAL(20,6) NOT NULL DEFAULT 0;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS last_unlock_at TIMESTAMP;

ALTER TABLE developers ADD CONSTRAINT developers_unlock_tier_check
  CHECK (unlock_tier >= 0 AND unlock_tier <= 4);

-- Create unlock history table
CREATE TABLE IF NOT EXISTS unlock_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_address VARCHAR(42) NOT NULL REFERENCES developers(wallet_address),
  amount DECIMAL(20,6) NOT NULL,
  from_tier SMALLINT NOT NULL,
  to_tier SMALLINT NOT NULL,
  tx_hash VARCHAR(66) NOT NULL UNIQUE,
  unlocked_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unlock_history_developer ON unlock_history(developer_address);
CREATE INDEX IF NOT EXISTS idx_unlock_history_unlocked_at ON unlock_history(unlocked_at);
```

## Validation Rules

### Rule: Unlock Tier Consistency

- `unlock_tier` MUST be between 0 and 4 inclusive
- `unlock_tier` MUST NOT decrease (unlocks are irreversible)
- `total_unlocked` MUST equal `unlock_tier × 50` (enforced by application logic)
- `total_unlocked` MUST NOT exceed `stake_amount` at time of staking (200 USDC)

### Rule: Unlock History Integrity

- Every `unlock_history` record MUST have a valid on-chain `tx_hash`
- `to_tier` MUST be greater than `from_tier`
- `amount` MUST equal `(to_tier - from_tier) × 50` USDC

### Rule: Source of Truth

- `projects_completed` is incremented by the milestoneListener when a `ProjectStateChanged(Completed)` event is processed
- The on-chain ProjectManager contract is the authoritative source; the DB field is a cache
- If discrepancy is detected, on-chain data takes precedence

## Related Specs

- **Architecture**: `architecture/auto-unstake-system/spec.md`
- **Capabilities**: `capabilities/stake-unlock/spec.md`
- **API**: `api/unstake-notification/spec.md`
- **Existing Schema**: `specs/data-models/developer/schema.md`
