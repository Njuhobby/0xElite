# Client (Modified for Reviews)

## Purpose

Extends the existing client entity with rating and review tracking fields to display client reputation scores.

## Schema

## MODIFIED Entities

### Entity: Client

**Table**: `clients`

**Added Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `average_rating` | DECIMAL(3,2) | NULL, CHECK (average_rating >= 1.0 AND average_rating <= 5.0) | Average of all ratings received (1.00 to 5.00) |
| `total_reviews` | INTEGER | NOT NULL, DEFAULT 0, CHECK (total_reviews >= 0) | Total number of reviews received |
| `rating_distribution` | JSONB | NOT NULL, DEFAULT '{"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}'::jsonb | Count of each rating (1-5 stars) |

**Existing Fields** (unchanged):
- `id`, `wallet_address`, `email`, `company_name`, `projects_posted`, `projects_completed`, `total_spent`, `created_at`, `updated_at`

**Updated Indexes**:
- Add: `idx_clients_average_rating` ON `average_rating DESC` (for sorting by rating)

**Calculation Logic**:

The `average_rating`, `total_reviews`, and `rating_distribution` fields are automatically updated by the `recalculate_ratings()` trigger function when reviews are created or updated.

**Trigger Function Extension** (pseudocode):
```sql
CREATE OR REPLACE FUNCTION recalculate_ratings() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reviewer_type = 'client' THEN
    -- Update developer ratings (see developer/schema.md)
    ...
  ELSIF NEW.reviewer_type = 'developer' THEN
    -- Update client ratings
    UPDATE clients
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

## Related Specs

- **Capabilities**: `capabilities/review-management/spec.md`
- **Data Models**: `data-models/review/schema.md`
- **APIs**: `api/review-management/spec.md`
