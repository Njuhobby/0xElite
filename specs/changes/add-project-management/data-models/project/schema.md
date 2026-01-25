# Project

## Purpose

Represents a project created by a client, containing metadata, milestone breakdown, and assignment tracking for developer work engagements.

## Schema

## ADDED Entities

### Entity: Project

Stores project information, budget, required skills, and lifecycle status.

**Table**: `projects`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, NOT NULL | Unique project identifier |
| `project_number` | SERIAL | UNIQUE, NOT NULL | Sequential project number for display (e.g., #1001) |
| `client_address` | VARCHAR(42) | NOT NULL, FOREIGN KEY → clients(wallet_address) | Wallet address of project creator |
| `title` | VARCHAR(200) | NOT NULL | Project title |
| `description` | TEXT | NOT NULL | Detailed project description |
| `required_skills` | JSONB | NOT NULL | Array of required skills (e.g., ["Solidity", "React"]) |
| `total_budget` | DECIMAL(20,6) | NOT NULL, CHECK (total_budget > 0) | Total project budget in USDC |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT 'draft' | Project status: draft, active, completed, disputed, cancelled |
| `assigned_developer` | VARCHAR(42) | FOREIGN KEY → developers(wallet_address), NULL | Assigned developer wallet address |
| `assigned_at` | TIMESTAMP | NULL | When developer was assigned |
| `started_at` | TIMESTAMP | NULL | When project became active |
| `completed_at` | TIMESTAMP | NULL | When all milestones completed |
| `contract_project_id` | BIGINT | NULL | On-chain project ID from ProjectManager contract |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Project creation time |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update time |

**Indexes**:
- `idx_projects_client` ON `client_address` (for client's project list)
- `idx_projects_developer` ON `assigned_developer` (for developer's assignments)
- `idx_projects_status` ON `status` (for filtering by status)
- `idx_projects_created` ON `created_at DESC` (for sorting by newest)

**Relationships**:
```typescript
Project {
  belongsTo: [Client, Developer]
  hasMany: [Milestone]
}
```

**Status Transitions**:
```
draft → active (when developer assigned)
active → completed (when all milestones completed)
active → disputed (when dispute filed)
active → cancelled (when client cancels before completion)
```

## Validation Rules

### Rule: Budget Allocation

- **MUST** have `total_budget > 0`
- **MUST** have at least one milestone
- **MUST** ensure sum of milestone budgets equals `total_budget`

### Rule: Status Transitions

- **MUST NOT** transition from `completed` to any other status
- **MUST NOT** transition from `cancelled` to any other status
- **SHOULD** transition to `active` only when `assigned_developer` is set

### Rule: Required Skills

- **MUST** have at least one required skill
- **MUST** use skills from predefined skill list (same as developer skills)

## Related Specs

- **Capabilities**: `capabilities/project-management/spec.md`
- **APIs**: `api/project-management/spec.md`
- **Data Models**: `data-models/milestone/schema.md`, `data-models/client/schema.md`
