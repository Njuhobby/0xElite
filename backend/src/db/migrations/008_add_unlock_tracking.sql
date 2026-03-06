-- Migration 008: Add unlock tracking for automatic stake returns
-- Tracks gradual USDC unlock as developers complete projects

-- Add unlock tracking fields to developers
ALTER TABLE developers ADD COLUMN IF NOT EXISTS unlock_tier SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS total_unlocked DECIMAL(20,6) NOT NULL DEFAULT 0;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS last_unlock_at TIMESTAMP;

ALTER TABLE developers DROP CONSTRAINT IF EXISTS developers_unlock_tier_check;
ALTER TABLE developers ADD CONSTRAINT developers_unlock_tier_check
  CHECK (unlock_tier >= 0 AND unlock_tier <= 4);

-- Create unlock history table for audit trail
CREATE TABLE IF NOT EXISTS unlock_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_address VARCHAR(42) NOT NULL REFERENCES developers(wallet_address),
  amount DECIMAL(20,6) NOT NULL,
  from_tier SMALLINT NOT NULL,
  to_tier SMALLINT NOT NULL,
  tx_hash VARCHAR(66) NOT NULL UNIQUE,
  unlocked_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unlock_history_developer ON unlock_history(developer_address);
CREATE INDEX IF NOT EXISTS idx_unlock_history_unlocked_at ON unlock_history(unlocked_at);
