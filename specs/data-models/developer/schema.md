# Developer Data Model

## Purpose

Stores developer profile information, including identity, skills, economic stake, and account status.

## Schema

### Entity: Developer

**Table**: `developers`

**Added Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `average_rating` | DECIMAL(3,2) | NULL, CHECK (average_rating >= 1.0 AND average_rating <= 5.0) | Average of all ratings received (1.00 to 5.00) |
| `total_reviews` | INTEGER | NOT NULL, DEFAULT 0, CHECK (total_reviews >= 0) | Total number of reviews received |
| `rating_distribution` | JSONB | NOT NULL, DEFAULT '{"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}'::jsonb | Count of each rating (1-5 stars) |

| `voting_power` | DECIMAL(20,6) | NOT NULL, DEFAULT 0 | Current voting power = total_earned × (average_rating / 5.0) |
| `elite_token_balance` | DECIMAL(20,6) | NOT NULL, DEFAULT 0 | Current EliteToken balance on-chain (synced from events) |
| `last_voting_power_update` | TIMESTAMP | NULL | When voting power was last recalculated |

| `admin_notes` | TEXT | NULL | Admin notes for approval/rejection reason |
| `reviewed_by` | VARCHAR(42) | NULL | Wallet address of reviewing admin |
| `reviewed_at` | TIMESTAMP | NULL | When admin reviewed the application |

**Existing Fields** (unchanged):
- `id`, `wallet_address`, `email`, `github_username`, `skills`, `bio`, `hourly_rate`, `availability`, `current_project_id`, `total_earned`, `projects_completed`, `total_staked`, `account_activated`, `status`, `profile_picture_url`, `created_at`, `updated_at`

**Updated Indexes**:
- Add: `idx_developers_average_rating` ON `average_rating DESC` (for sorting by rating)
- Add: `idx_developers_voting_power` ON `voting_power DESC` (for voter eligibility queries)

**Calculation Logic**:

The `average_rating`, `total_reviews`, and `rating_distribution` fields are automatically updated by the `recalculate_ratings()` trigger function when reviews are created or updated.

The `voting_power` field is recalculated by the backend whenever `total_earned` or `average_rating` changes:

```
voting_power = total_earned × (average_rating / 5.0)
```

- If `average_rating` is NULL (no reviews), voting_power = 0
- If `total_earned` is 0, voting_power = 0
- Backend then mints/burns EliteToken to match the new voting_power

**Trigger Function** (pseudocode):
```sql
CREATE OR REPLACE FUNCTION recalculate_ratings() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reviewer_type = 'client' THEN
    -- Update developer ratings
    UPDATE developers
    SET
      average_rating = (SELECT AVG(rating)::DECIMAL(3,2) FROM reviews WHERE reviewee_address = NEW.reviewee_address),
      total_reviews = (SELECT COUNT(*) FROM reviews WHERE reviewee_address = NEW.reviewee_address),
      rating_distribution = (
        SELECT jsonb_build_object(
          '1', COUNT(*) FILTER (WHERE rating = 1),
          '2', COUNT(*) FILTER (WHERE rating = 2),
          '3', COUNT(*) FILTER (WHERE rating = 3),
          '4', COUNT(*) FILTER (WHERE rating = 4),
          '5', COUNT(*) FILTER (WHERE rating = 5)
        )
        FROM reviews
        WHERE reviewee_address = NEW.reviewee_address
      ),
      updated_at = NOW()
    WHERE wallet_address = NEW.reviewee_address;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Validation Rules

### Rule: Rating Consistency

- **MUST** ensure average_rating is NULL when total_reviews = 0
- **MUST** ensure average_rating is NOT NULL when total_reviews > 0
- **MUST** ensure sum of rating_distribution values equals total_reviews

### Rule: Rating Range

- **MUST** keep average_rating between 1.0 and 5.0 when not NULL

### Rule: Voting Power Consistency

- **MUST** ensure voting_power = 0 when average_rating is NULL or total_earned = 0
- **MUST** ensure voting_power >= 0 (never negative)
- **SHOULD** keep elite_token_balance in sync with on-chain EliteToken balance

## Related Specs

- **Capabilities**: `capabilities/review-management/spec.md`, `capabilities/dispute-resolution/spec.md`
- **Data Models**: `data-models/review/schema.md`
- **APIs**: `api/review-management/spec.md`
- **Architecture**: `architecture/elite-token-contract/spec.md`

## Validation Rules

### Rule: Email Format

- **MUST** be a valid email format matching regex: `^[^\s@]+@[^\s@]+\.[^\s@]+$`
- **MUST** be unique across all developers
- **MUST NOT** be empty or null

### Rule: GitHub Username

- **MAY** be null (optional field)
- **MUST** be unique if provided
- **MUST** match GitHub username format: alphanumeric and hyphens, 1-39 chars
- **MUST NOT** be changed after initial registration

### Rule: Skills

- **MUST** contain at least 1 skill
- **MUST NOT** contain more than 10 skills
- **SHOULD** use predefined skill tags from the system skill taxonomy

### Rule: Bio

- **MAY** be null
- **MUST NOT** exceed 500 characters
- **SHOULD** be sanitized to prevent XSS (strip HTML tags)

### Rule: Hourly Rate

- **MAY** be null
- **MUST** be a positive number if provided
- **SHOULD** be between 10 and 500 USD for realistic rates

### Rule: Stake Amount

- **MUST** be synced from blockchain StakeVault contract
- **MUST** be >= required minimum stake for status to be 'active'
- **MUST NOT** be manually editable (only updated via event listener)

### Rule: Status Transitions

- **MUST** start as 'pending' on registration
- **MUST** transition to 'staked' when stake event detected
- **MUST** transition to 'active' only by admin approval (from 'staked')
- **MAY** transition to 'rejected' by admin action (from 'staked')
- **MAY** transition to 'suspended' by admin action
- **MUST NOT** transition from 'active' to 'pending'

## Data Lifecycle

### Creation (POST /developers)

1. Developer submits form with signature
2. Backend validates signature and uniqueness
3. Create record with `status='pending'`, `stake_amount=0`
4. Developer stakes USDC on-chain
5. Event listener updates `status='staked'`, `stake_amount=X`, `staked_at=NOW()`, pending admin review
6. Admin reviews and approves (status='active') or rejects (status='rejected')

### Updates (PUT /developers/:address)

1. Developer modifies editable fields (email, skills, bio, hourly_rate, availability)
2. Backend validates signature (must be wallet owner)
3. Update `updated_at=NOW()`
4. GitHub username is locked and cannot be changed

### Reads (GET /developers/:address)

1. Public fields returned for all viewers
2. Private fields (email) only returned to owner
3. Cached reputation metrics joined from separate calculation

## Related Specs

- **Capabilities**: `capabilities/developer-onboarding/spec.md`
- **APIs**: `api/developer-management/spec.md`
- **Architecture**: `architecture/event-sync-system/spec.md`
