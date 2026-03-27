-- Add 'created' status for developers who saved profile but haven't staked yet
-- New status flow: created → staked → active/rejected

ALTER TABLE developers DROP CONSTRAINT IF EXISTS developers_status_check;
ALTER TABLE developers ADD CONSTRAINT developers_status_check
  CHECK (status IN ('created', 'pending', 'staked', 'active', 'rejected', 'suspended'));

-- Change default status from 'pending' to 'created'
ALTER TABLE developers ALTER COLUMN status SET DEFAULT 'created';
