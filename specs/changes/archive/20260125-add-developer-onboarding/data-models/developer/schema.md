# Developer Data Model

## Purpose

Stores developer profile information, including identity, skills, economic stake, and account status.

## Schema

### Entity: Developer

Represents a Web3 developer registered on the 0xElite platform.

**Table**: `developers`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `wallet_address` | VARCHAR(42) | PRIMARY KEY, NOT NULL | Ethereum wallet address (checksummed, lowercase storage) |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | Contact email for notifications |
| `github_username` | VARCHAR(39) | UNIQUE, NULLABLE | GitHub username (optional, locked after set) |
| `skills` | JSONB / TEXT[] | NOT NULL | Array of skill tags (1-10 items) |
| `bio` | TEXT | NULLABLE | Developer biography (max 500 chars, enforced in app) |
| `hourly_rate` | DECIMAL(10,2) | NULLABLE | Expected hourly rate in USD |
| `availability` | ENUM('available', 'busy', 'vacation') | NOT NULL, DEFAULT 'available' | Current availability status |
| `stake_amount` | DECIMAL(20,6) | NOT NULL, DEFAULT 0 | Amount of USDC staked (synced from chain) |
| `staked_at` | TIMESTAMP | NULLABLE | When the stake was deposited |
| `status` | ENUM('pending', 'active', 'suspended') | NOT NULL, DEFAULT 'pending' | Account activation status |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Registration timestamp |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last profile update timestamp |

**Indexes**:
- `idx_developers_email` ON `email` (for uniqueness checks, lookup by email)
- `idx_developers_github` ON `github_username` WHERE `github_username` IS NOT NULL (partial index for uniqueness)
- `idx_developers_status` ON `status` (for filtering active developers)
- `idx_developers_availability` ON `availability` WHERE `status` = 'active' (for matching available developers)
- `idx_developers_created_at` ON `created_at` DESC (for sorting by join date)

**Relationships**:
```typescript
Developer {
  hasMany: [Project] // Projects assigned to this developer
  hasMany: [Invitation] // Project invitations received
  hasMany: [Review] // Reviews received from clients
}
```

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
- **MUST** transition to 'active' when stake amount >= required stake
- **MAY** transition to 'suspended' by admin action
- **MUST NOT** transition from 'active' to 'pending'

## Data Lifecycle

### Creation (POST /developers)

1. Developer submits form with signature
2. Backend validates signature and uniqueness
3. Create record with `status='pending'`, `stake_amount=0`
4. Developer stakes USDC on-chain
5. Event listener updates `status='active'`, `stake_amount=X`, `staked_at=NOW()`

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
