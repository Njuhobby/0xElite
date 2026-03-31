-- Migration 011: Add 'deposited' status to projects
-- New flow: draft → deposited → active → completed
-- 'deposited' means escrow is funded but no developer assigned yet

ALTER TABLE projects DROP CONSTRAINT IF EXISTS valid_status;
ALTER TABLE projects ADD CONSTRAINT valid_status
  CHECK (status IN ('draft', 'deposited', 'active', 'completed', 'disputed', 'cancelled'));
