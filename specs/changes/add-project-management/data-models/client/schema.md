# Client

## Purpose

Represents clients who create and manage projects on the platform, with optional profile information for enhanced features.

## Schema

## ADDED Entities

### Entity: Client

Stores client profile information and registration status.

**Table**: `clients`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `wallet_address` | VARCHAR(42) | PRIMARY KEY, NOT NULL | Client's wallet address (lowercase) |
| `email` | VARCHAR(255) | UNIQUE, NULL | Client email address (optional) |
| `company_name` | VARCHAR(200) | NULL | Company or individual name |
| `description` | TEXT | NULL | Company description or bio |
| `website` | VARCHAR(500) | NULL | Company website URL |
| `is_registered` | BOOLEAN | NOT NULL, DEFAULT FALSE | Whether client completed full profile registration |
| `projects_created` | INTEGER | NOT NULL, DEFAULT 0 | Total number of projects created |
| `projects_completed` | INTEGER | NOT NULL, DEFAULT 0 | Number of successfully completed projects |
| `total_spent` | DECIMAL(20,6) | NOT NULL, DEFAULT 0 | Total USDC spent on completed projects |
| `reputation_score` | DECIMAL(3,2) | NULL, CHECK (reputation_score >= 0 AND reputation_score <= 5) | Client reputation (0-5 stars) |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Account creation time |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update time |

**Indexes**:
- `idx_clients_email` ON `email` (for email lookups if provided)
- `idx_clients_registered` ON `is_registered` (for filtering registered vs minimal profiles)
- `idx_clients_reputation` ON `reputation_score DESC` (for sorting by reputation)

**Relationships**:
```typescript
Client {
  hasMany: [Project]
  belongsTo: []
}
```

## Validation Rules

### Rule: Email Uniqueness

- **MUST** ensure email is unique if provided
- **MAY** allow multiple clients without email (minimal profiles)

### Rule: Registration Status

- **MUST** set `is_registered = FALSE` on first project creation by new wallet
- **MUST** set `is_registered = TRUE` when client completes profile with company_name and email
- **SHOULD** encourage profile completion but not require it

### Rule: Reputation Score

- **MUST** be between 0 and 5 if set
- **SHOULD** calculate based on completed projects and developer ratings
- **MAY** be NULL for clients with no completed projects

### Rule: Project Counters

- **MUST** increment `projects_created` when new project created
- **MUST** increment `projects_completed` when project status changes to completed
- **MUST** add project budget to `total_spent` when project completed

## Related Specs

- **Capabilities**: `capabilities/project-management/spec.md`
- **APIs**: `api/project-management/spec.md`
- **Data Models**: `data-models/project/schema.md`
