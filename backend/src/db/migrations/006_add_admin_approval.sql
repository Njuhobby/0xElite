-- Add admin approval gate to developer onboarding
-- New status flow: pending → staked → active/rejected

-- Step 1: Add new status values to CHECK constraint
-- Drop the old constraint and add updated one with 'staked' and 'rejected'
ALTER TABLE developers DROP CONSTRAINT IF EXISTS developers_status_check;
ALTER TABLE developers ADD CONSTRAINT developers_status_check
  CHECK (status IN ('pending', 'staked', 'active', 'rejected', 'suspended'));

-- Step 2: Add admin review columns
ALTER TABLE developers ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE developers ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(42);
ALTER TABLE developers ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

-- Step 3: Add partial index for efficient admin listing of staked developers
CREATE INDEX IF NOT EXISTS idx_developers_staked
  ON developers(created_at DESC)
  WHERE status = 'staked';
