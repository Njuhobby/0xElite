# Milestone

## Purpose

Represents individual deliverables within a project, each with its own budget, deliverables, and completion status.

## Schema

## ADDED Entities

### Entity: Milestone

Stores milestone information including deliverables, budget allocation, and completion tracking.

**Table**: `milestones`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, NOT NULL | Unique milestone identifier |
| `project_id` | UUID | NOT NULL, FOREIGN KEY → projects(id) ON DELETE CASCADE | Parent project |
| `milestone_number` | INTEGER | NOT NULL | Sequential number within project (1, 2, 3...) |
| `title` | VARCHAR(200) | NOT NULL | Milestone title |
| `description` | TEXT | NOT NULL | Detailed milestone description |
| `deliverables` | JSONB | NOT NULL | Array of deliverable descriptions |
| `budget` | DECIMAL(20,6) | NOT NULL, CHECK (budget > 0) | Milestone budget in USDC |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | Status: pending, in_progress, pending_review, completed, disputed |
| `started_at` | TIMESTAMP | NULL | When developer started working |
| `submitted_at` | TIMESTAMP | NULL | When developer submitted for review |
| `completed_at` | TIMESTAMP | NULL | When client approved completion |
| `deliverable_urls` | JSONB | NULL | Array of URLs to submitted deliverables (GitHub PRs, deployed sites, etc.) |
| `review_notes` | TEXT | NULL | Client's review notes |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Milestone creation time |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last update time |

**Indexes**:
- `idx_milestones_project` ON `project_id` (for fetching project's milestones)
- `idx_milestones_status` ON `status` (for filtering by status)
- `idx_milestones_number` ON `(project_id, milestone_number)` UNIQUE (ensure unique numbering per project)

**Relationships**:
```typescript
Milestone {
  belongsTo: [Project]
  hasMany: []
}
```

**Status Transitions**:
```
pending → in_progress (developer starts work)
in_progress → pending_review (developer submits)
pending_review → completed (client approves)
pending_review → in_progress (client requests revisions)
in_progress → disputed (dispute filed)
pending_review → disputed (dispute filed)
```

## Validation Rules

### Rule: Deliverables

- **MUST** have at least one deliverable description
- **SHOULD** provide `deliverable_urls` when status is `pending_review`
- **MUST NOT** mark as `completed` without `deliverable_urls`

### Rule: Budget Allocation

- **MUST** have `budget > 0`
- **MUST NOT** exceed remaining project budget when adding new milestones

### Rule: Sequential Completion

- **SHOULD** complete milestones in sequential order (milestone 1 before milestone 2)
- **MAY** allow parallel work on multiple milestones

### Rule: Status Transitions

- **MUST NOT** transition to `completed` without client approval
- **MUST** have `deliverable_urls` when transitioning to `pending_review`
- **SHOULD** record timestamps for each status change

## Related Specs

- **Capabilities**: `capabilities/project-management/spec.md`
- **APIs**: `api/project-management/spec.md`
- **Data Models**: `data-models/project/schema.md`
