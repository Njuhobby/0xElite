# Developer

## Purpose

Extends the developer data model to track voting power for DAO arbitration.

## Schema

## MODIFIED Entities

### Entity: Developer

**Table**: `developers`

**Added Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `voting_power` | DECIMAL(20,6) | NOT NULL, DEFAULT 0 | Current voting power = total_earned × (average_rating / 5.0) |
| `elite_token_balance` | DECIMAL(20,6) | NOT NULL, DEFAULT 0 | Current EliteToken balance on-chain (synced from events) |
| `last_voting_power_update` | TIMESTAMP | NULL | When voting power was last recalculated |

**Existing Fields** (unchanged):
- `id`, `wallet_address`, `email`, `github_username`, `skills`, `bio`, `hourly_rate`, `availability`, `current_project_id`, `total_earned`, `projects_completed`, `total_staked`, `account_activated`, `status`, `profile_picture_url`, `average_rating`, `total_reviews`, `rating_distribution`, `created_at`, `updated_at`

**Updated Indexes**:
- Add: `idx_developers_voting_power` ON `voting_power DESC` (for voter eligibility queries)

**Calculation Logic**:

The `voting_power` field is recalculated by the backend whenever `total_earned` or `average_rating` changes:

```
voting_power = total_earned × (average_rating / 5.0)
```

- If `average_rating` is NULL (no reviews), voting_power = 0
- If `total_earned` is 0, voting_power = 0
- Backend then mints/burns EliteToken to match the new voting_power

## Validation Rules

### Rule: Voting Power Consistency

- **MUST** ensure voting_power = 0 when average_rating is NULL or total_earned = 0
- **MUST** ensure voting_power >= 0 (never negative)
- **SHOULD** keep elite_token_balance in sync with on-chain EliteToken balance

## Related Specs

- **Capabilities**: `capabilities/dispute-resolution/spec.md`
- **Architecture**: `architecture/elite-token-contract/spec.md`
