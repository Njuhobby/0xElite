-- Migration: 004_create_reviews_table.sql
-- Description: Create reviews table and add rating tracking fields to developers/clients
-- Dependencies: 002_create_project_tables.sql

-- ==============================================
-- 1. CREATE REVIEWS TABLE
-- ==============================================

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reviewer_address VARCHAR(42) NOT NULL,
  reviewee_address VARCHAR(42) NOT NULL,
  reviewer_type VARCHAR(20) NOT NULL CHECK (reviewer_type IN ('client', 'developer')),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- One review per project per reviewer
  CONSTRAINT unique_review_per_project_side UNIQUE (project_id, reviewer_address),
  -- Cannot review yourself
  CONSTRAINT no_self_review CHECK (reviewer_address != reviewee_address)
);

COMMENT ON TABLE reviews IS 'Bidirectional reviews between clients and developers after project completion';
COMMENT ON COLUMN reviews.reviewer_type IS 'client = client reviewing developer, developer = developer reviewing client';
COMMENT ON COLUMN reviews.comment IS 'Optional review text, max 1000 characters (enforced in application)';

-- Indexes
CREATE INDEX idx_reviews_reviewee ON reviews(reviewee_address);
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_address);
CREATE INDEX idx_reviews_project ON reviews(project_id);
CREATE INDEX idx_reviews_created_at ON reviews(created_at DESC);
CREATE INDEX idx_reviews_reviewee_type_created ON reviews(reviewee_address, reviewer_type, created_at DESC);

-- Auto-update timestamp trigger
CREATE TRIGGER update_reviews_timestamp
BEFORE UPDATE ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- 2. ALTER DEVELOPERS TABLE - ADD RATING FIELDS
-- ==============================================

-- total_reviews count
ALTER TABLE developers
ADD COLUMN IF NOT EXISTS total_reviews INTEGER NOT NULL DEFAULT 0;

-- rating_distribution as JSONB
ALTER TABLE developers
ADD COLUMN IF NOT EXISTS rating_distribution JSONB NOT NULL DEFAULT '{"1":0,"2":0,"3":0,"4":0,"5":0}';

-- ==============================================
-- 3. ALTER CLIENTS TABLE - ADD RATING FIELDS
-- ==============================================

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2) CHECK (average_rating >= 0 AND average_rating <= 5);

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS total_reviews INTEGER NOT NULL DEFAULT 0;

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS rating_distribution JSONB NOT NULL DEFAULT '{"1":0,"2":0,"3":0,"4":0,"5":0}';

-- Index for client rating
CREATE INDEX IF NOT EXISTS idx_clients_avg_rating ON clients(average_rating DESC);

-- ==============================================
-- 4. RATING RECALCULATION FUNCTION
-- ==============================================

CREATE OR REPLACE FUNCTION recalculate_ratings()
RETURNS TRIGGER AS $$
DECLARE
  target_address VARCHAR(42);
  target_type VARCHAR(20);
  avg_val DECIMAL(3,2);
  total_val INTEGER;
  dist_val JSONB;
BEGIN
  -- Determine who is being reviewed
  IF TG_OP = 'DELETE' THEN
    target_address := OLD.reviewee_address;
    target_type := OLD.reviewer_type;
  ELSE
    target_address := NEW.reviewee_address;
    target_type := NEW.reviewer_type;
  END IF;

  -- Calculate new values
  SELECT
    ROUND(AVG(rating)::numeric, 2),
    COUNT(*),
    jsonb_build_object(
      '1', COUNT(*) FILTER (WHERE rating = 1),
      '2', COUNT(*) FILTER (WHERE rating = 2),
      '3', COUNT(*) FILTER (WHERE rating = 3),
      '4', COUNT(*) FILTER (WHERE rating = 4),
      '5', COUNT(*) FILTER (WHERE rating = 5)
    )
  INTO avg_val, total_val, dist_val
  FROM reviews
  WHERE reviewee_address = target_address
    AND reviewer_type = target_type;

  -- Update the appropriate table
  IF target_type = 'client' THEN
    -- Client is reviewing, so reviewee is a developer
    UPDATE developers
    SET average_rating = avg_val,
        total_reviews = total_val,
        rating_distribution = dist_val
    WHERE wallet_address = target_address;
  ELSE
    -- Developer is reviewing, so reviewee is a client
    UPDATE clients
    SET average_rating = avg_val,
        total_reviews = total_val,
        rating_distribution = dist_val
    WHERE wallet_address = target_address;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Triggers to recalculate ratings
CREATE TRIGGER update_ratings_after_review_insert
AFTER INSERT ON reviews
FOR EACH ROW
EXECUTE FUNCTION recalculate_ratings();

CREATE TRIGGER update_ratings_after_review_update
AFTER UPDATE ON reviews
FOR EACH ROW
WHEN (OLD.rating IS DISTINCT FROM NEW.rating)
EXECUTE FUNCTION recalculate_ratings();

CREATE TRIGGER update_ratings_after_review_delete
AFTER DELETE ON reviews
FOR EACH ROW
EXECUTE FUNCTION recalculate_ratings();

-- ==============================================
-- MIGRATION COMPLETE
-- ==============================================

INSERT INTO system_state (key, value, updated_at)
VALUES ('migration_004_reviews', '{"status": "completed", "timestamp": "' || NOW() || '"}', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
