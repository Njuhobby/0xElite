-- Migration: 005_create_dispute_tables.sql
-- Description: Create disputes and dispute_votes tables, add voting power fields to developers
-- Dependencies: 001_create_developers_table.sql, 002_create_project_tables.sql

-- ==============================================
-- 1. ALTER DEVELOPERS TABLE - ADD VOTING POWER FIELDS
-- ==============================================

ALTER TABLE developers
ADD COLUMN IF NOT EXISTS voting_power DECIMAL(20,6) NOT NULL DEFAULT 0;

ALTER TABLE developers
ADD COLUMN IF NOT EXISTS elite_token_balance DECIMAL(20,6) NOT NULL DEFAULT 0;

ALTER TABLE developers
ADD COLUMN IF NOT EXISTS last_voting_power_update TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_developers_voting_power ON developers(voting_power DESC);

COMMENT ON COLUMN developers.voting_power IS 'Current voting power = total_earned × (average_rating / 5.0)';
COMMENT ON COLUMN developers.elite_token_balance IS 'Current EliteToken balance on-chain (synced from events)';
COMMENT ON COLUMN developers.last_voting_power_update IS 'When voting power was last recalculated';

-- ==============================================
-- 2. CREATE DISPUTES TABLE
-- ==============================================

CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_number SERIAL NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_address VARCHAR(42) NOT NULL,
  developer_address VARCHAR(42) NOT NULL,
  initiator_address VARCHAR(42) NOT NULL,
  initiator_role VARCHAR(20) NOT NULL CHECK (initiator_role IN ('client', 'developer')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'voting', 'resolved')),
  client_evidence_uri VARCHAR(500) NULL,
  developer_evidence_uri VARCHAR(500) NULL,
  evidence_deadline TIMESTAMP NOT NULL,
  voting_deadline TIMESTAMP NULL,
  voting_snapshot TIMESTAMP NULL,
  client_vote_weight DECIMAL(20,6) NOT NULL DEFAULT 0,
  developer_vote_weight DECIMAL(20,6) NOT NULL DEFAULT 0,
  total_vote_weight DECIMAL(20,6) NOT NULL DEFAULT 0,
  quorum_required DECIMAL(20,6) NULL,
  winner VARCHAR(20) NULL CHECK (winner IN ('client', 'developer')),
  resolved_by_owner BOOLEAN NOT NULL DEFAULT false,
  client_share DECIMAL(20,6) NULL,
  developer_share DECIMAL(20,6) NULL,
  arbitration_fee DECIMAL(20,6) NOT NULL DEFAULT 50.000000,
  chain_dispute_id INTEGER NULL,
  creation_tx_hash VARCHAR(66) NULL,
  resolution_tx_hash VARCHAR(66) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Initiator must be one of the project parties
  CONSTRAINT initiator_must_be_party CHECK (
    initiator_address = client_address OR initiator_address = developer_address
  )
);

COMMENT ON TABLE disputes IS 'Dispute records for DAO arbitration system';
COMMENT ON COLUMN disputes.dispute_number IS 'Auto-incrementing human-readable dispute number';
COMMENT ON COLUMN disputes.status IS 'Dispute phase: open (evidence), voting, resolved';
COMMENT ON COLUMN disputes.chain_dispute_id IS 'On-chain dispute ID from DisputeDAO contract';
COMMENT ON COLUMN disputes.quorum_required IS '25% of total EliteToken supply at voting snapshot';

-- Indexes
CREATE INDEX idx_disputes_project ON disputes(project_id);
CREATE INDEX idx_disputes_status ON disputes(status);
CREATE INDEX idx_disputes_initiator ON disputes(initiator_address);
CREATE INDEX idx_disputes_chain_id ON disputes(chain_dispute_id);
CREATE INDEX idx_disputes_created_at ON disputes(created_at DESC);

-- Auto-update timestamp trigger
CREATE TRIGGER update_disputes_timestamp
BEFORE UPDATE ON disputes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- 3. CREATE DISPUTE_VOTES TABLE
-- ==============================================

CREATE TABLE IF NOT EXISTS dispute_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  voter_address VARCHAR(42) NOT NULL,
  support_client BOOLEAN NOT NULL,
  vote_weight DECIMAL(20,6) NOT NULL CHECK (vote_weight > 0),
  reward_amount DECIMAL(20,6) NULL,
  tx_hash VARCHAR(66) NULL,
  voted_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- One vote per developer per dispute
  CONSTRAINT unique_vote_per_dispute UNIQUE (dispute_id, voter_address)
);

COMMENT ON TABLE dispute_votes IS 'Individual votes cast by developers in dispute resolution';
COMMENT ON COLUMN dispute_votes.support_client IS 'True = vote for client, False = vote for developer';
COMMENT ON COLUMN dispute_votes.vote_weight IS 'EliteToken balance at voting snapshot';
COMMENT ON COLUMN dispute_votes.reward_amount IS 'Participation reward minted after resolution';

-- Indexes
CREATE INDEX idx_dispute_votes_dispute ON dispute_votes(dispute_id);
CREATE INDEX idx_dispute_votes_voter ON dispute_votes(voter_address);

-- ==============================================
-- 4. ONE ACTIVE DISPUTE PER PROJECT CONSTRAINT
-- ==============================================

-- Partial unique index: only one non-resolved dispute per project
CREATE UNIQUE INDEX idx_one_active_dispute_per_project
ON disputes(project_id) WHERE status != 'resolved';

-- ==============================================
-- 5. VOTING POWER RECALCULATION FUNCTION
-- ==============================================

-- Recalculate voting power when total_earned or average_rating changes
CREATE OR REPLACE FUNCTION recalculate_voting_power()
RETURNS TRIGGER AS $$
BEGIN
  -- voting_power = total_earned × (average_rating / 5.0)
  IF NEW.average_rating IS NOT NULL AND NEW.total_earned > 0 THEN
    NEW.voting_power := NEW.total_earned * (NEW.average_rating / 5.0);
  ELSE
    NEW.voting_power := 0;
  END IF;
  NEW.last_voting_power_update := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_developer_voting_power
BEFORE UPDATE OF total_earned, average_rating ON developers
FOR EACH ROW
WHEN (
  OLD.total_earned IS DISTINCT FROM NEW.total_earned
  OR OLD.average_rating IS DISTINCT FROM NEW.average_rating
)
EXECUTE FUNCTION recalculate_voting_power();

-- ==============================================
-- 6. DISPUTE STATUS TRANSITION VALIDATION
-- ==============================================

CREATE OR REPLACE FUNCTION validate_dispute_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Only allow: open → voting → resolved
  IF OLD.status = 'open' AND NEW.status NOT IN ('voting', 'resolved') THEN
    RAISE EXCEPTION 'Invalid dispute status transition from open to %', NEW.status;
  END IF;

  IF OLD.status = 'voting' AND NEW.status != 'resolved' THEN
    RAISE EXCEPTION 'Invalid dispute status transition from voting to %', NEW.status;
  END IF;

  IF OLD.status = 'resolved' THEN
    RAISE EXCEPTION 'Cannot change status of a resolved dispute';
  END IF;

  -- Set resolved_at when transitioning to resolved
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    NEW.resolved_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_dispute_status
BEFORE UPDATE OF status ON disputes
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION validate_dispute_status_transition();

-- ==============================================
-- MIGRATION COMPLETE
-- ==============================================

INSERT INTO system_state (key, value, updated_at)
VALUES ('migration_005_disputes', '{"status": "completed", "timestamp": "' || NOW() || '"}', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
