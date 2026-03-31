-- Add 'created_on_chain' to valid project statuses
ALTER TABLE projects DROP CONSTRAINT IF EXISTS valid_status;
ALTER TABLE projects ADD CONSTRAINT valid_status
  CHECK (status IN ('draft', 'created_on_chain', 'deposited', 'active', 'completed', 'disputed', 'cancelled'));
