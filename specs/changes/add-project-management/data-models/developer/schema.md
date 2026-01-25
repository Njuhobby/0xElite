# Developer

## Purpose

Extends the developer entity with project assignment tracking and workload management.

## Schema

## MODIFIED Entities

### Entity: Developer

**Table**: `developers`

Add the following fields to the existing `developers` table:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `current_project_id` | UUID | FOREIGN KEY → projects(id), NULL | Currently assigned project (NULL if available) |
| `projects_completed` | INTEGER | NOT NULL, DEFAULT 0 | Number of successfully completed projects |
| `total_earned` | DECIMAL(20,6) | NOT NULL, DEFAULT 0 | Total USDC earned from completed projects |
| `average_rating` | DECIMAL(3,2) | NULL, CHECK (average_rating >= 0 AND average_rating <= 5) | Average client rating (0-5 stars) |
| `last_assignment_at` | TIMESTAMP | NULL | When developer was last assigned to a project |

**Modified Fields**: Update the `availability` field logic:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `availability` | VARCHAR(20) | NOT NULL, DEFAULT 'available' | Status: available, busy, vacation (auto-set to 'busy' when assigned) |

**New Indexes**:
- `idx_developers_current_project` ON `current_project_id` (for finding assigned developers)
- `idx_developers_availability` ON `availability` (for finding available developers)
- `idx_developers_rating` ON `average_rating DESC` (for sorting by reputation)

**Updated Relationships**:
```typescript
Developer {
  hasMany: [Project]  // All projects ever assigned
  belongsTo: []
  hasOne: [Project]   // Current active project
}
```

## Validation Rules

### Rule: Assignment Status Sync

- **MUST** set `availability = 'busy'` when `current_project_id` is not NULL
- **MUST** set `availability = 'available'` when `current_project_id` is NULL (unless status is 'vacation')
- **MUST** update `last_assignment_at` when new project assigned

### Rule: Project Completion Tracking

- **MUST** increment `projects_completed` when assigned project status changes to 'completed'
- **MUST** add project budget to `total_earned` when project completed and paid
- **MUST** update `average_rating` based on client ratings

### Rule: Availability Override

- **SHOULD** allow developer to set `availability = 'vacation'` manually
- **MUST NOT** assign projects to developers with `availability = 'vacation'`
- **MUST** automatically set `availability = 'available'` when developer changes status from 'vacation' and has no current project

## Related Specs

- **Capabilities**: `capabilities/project-management/spec.md`, `capabilities/developer-onboarding/spec.md`
- **APIs**: `api/developer-management/spec.md`
- **Data Models**: `data-models/project/schema.md`
