# Review

## Purpose

Stores bidirectional reviews and ratings submitted by clients and developers after project completion, enabling reputation tracking and trust building.

## Schema

## ADDED Entities

### Entity: Review

Represents a single review submitted by a client or developer for their counterpart after project completion.

**Table**: `reviews`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, NOT NULL, DEFAULT gen_random_uuid() | Unique review identifier |
| `project_id` | UUID | NOT NULL, REFERENCES projects(id) ON DELETE CASCADE | Project being reviewed |
| `reviewer_address` | VARCHAR(42) | NOT NULL | Wallet address of review author (client or developer) |
| `reviewee_address` | VARCHAR(42) | NOT NULL | Wallet address of person being reviewed |
| `reviewer_type` | VARCHAR(20) | NOT NULL, CHECK (reviewer_type IN ('client', 'developer')) | Type of reviewer |
| `rating` | INTEGER | NOT NULL, CHECK (rating >= 1 AND rating <= 5) | Star rating (1-5) |
| `comment` | TEXT | NULL | Optional text review (max 1000 chars, enforced in app) |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Review submission time |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last edit time |

**Indexes**:
- `idx_reviews_reviewee` ON `reviewee_address` (fast lookup for profile reviews)
- `idx_reviews_project` ON `project_id` (project-specific reviews)
- `idx_reviews_created_at` ON `created_at DESC` (chronological ordering)

**Unique Constraints**:
- `unique_review_per_project_side` ON `(project_id, reviewer_address)` (prevents duplicate reviews from same reviewer on same project)

**Relationships**:
```typescript
Review {
  belongsTo: [Project]
  references: [Developer (via reviewee_address if reviewer_type = 'client')]
  references: [Client (via reviewee_address if reviewer_type = 'developer')]
}
```

**Triggers**:
```sql
-- Trigger to update developer/client ratings after INSERT
CREATE TRIGGER update_ratings_after_review_insert
AFTER INSERT ON reviews
FOR EACH ROW
EXECUTE FUNCTION recalculate_ratings();

-- Trigger to update developer/client ratings after UPDATE
CREATE TRIGGER update_ratings_after_review_update
AFTER UPDATE ON reviews
FOR EACH ROW
WHEN (OLD.rating IS DISTINCT FROM NEW.rating)
EXECUTE FUNCTION recalculate_ratings();
```

## Validation Rules

### Rule: Review Text Length

- **MUST NOT** exceed 1000 characters (enforced in application layer)
- **MAY** be NULL (rating-only reviews allowed)

### Rule: Rating Range

- **MUST** be an integer between 1 and 5 (inclusive)
- **MUST NOT** be NULL

### Rule: Reviewer Authorization

- **MUST** verify reviewer_address is either:
  - The project's client_address (if reviewer_type = 'client')
  - The project's assigned_developer (if reviewer_type = 'developer')
- **MUST NOT** allow reviewee_address to equal reviewer_address (no self-reviews)

### Rule: Project Completion

- **MUST** verify project status = 'completed' before allowing review submission
- **MUST NOT** allow reviews for active, pending, or draft projects

### Rule: Edit Window

- **MUST** allow edits only if (NOW() - created_at) <= 7 days
- **MUST** update updated_at timestamp on edit

## Related Specs

- **Capabilities**: `capabilities/review-management/spec.md`
- **APIs**: `api/review-management/spec.md`
- **Data Models**: `data-models/developer/schema.md`, `data-models/client/schema.md`
