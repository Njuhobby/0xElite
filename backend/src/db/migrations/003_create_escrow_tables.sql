-- Migration: 003_create_escrow_tables.sql
-- Description: Create escrow and payment tracking tables, add escrow fields to projects and milestones
-- Dependencies: 002_create_project_tables.sql

-- ==============================================
-- 1. CREATE ESCROW_DEPOSITS TABLE
-- ==============================================

CREATE TABLE IF NOT EXISTS escrow_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contract_project_id BIGINT NOT NULL,
  total_deposited DECIMAL(20,6) NOT NULL CHECK (total_deposited >= 0),
  total_released DECIMAL(20,6) NOT NULL DEFAULT 0 CHECK (total_released >= 0),
  escrow_balance DECIMAL(20,6) GENERATED ALWAYS AS (total_deposited - total_released) STORED,
  is_frozen BOOLEAN NOT NULL DEFAULT false,
  frozen_at TIMESTAMP NULL,
  frozen_by VARCHAR(42) NULL,
  deposit_tx_hash VARCHAR(66) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_released_not_exceed_deposited CHECK (total_released <= total_deposited)
);

COMMENT ON TABLE escrow_deposits IS 'Tracks USDC escrow deposits and balances for projects';
COMMENT ON COLUMN escrow_deposits.project_id IS 'One-to-one relationship with projects table';
COMMENT ON COLUMN escrow_deposits.contract_project_id IS 'Project ID in EscrowVault smart contract';
COMMENT ON COLUMN escrow_deposits.escrow_balance IS 'Computed column: total_deposited - total_released';
COMMENT ON COLUMN escrow_deposits.is_frozen IS 'Whether escrow is frozen due to dispute';

-- Indexes
CREATE INDEX idx_escrow_project ON escrow_deposits(project_id);
CREATE INDEX idx_escrow_contract_project ON escrow_deposits(contract_project_id);
CREATE INDEX idx_escrow_frozen ON escrow_deposits(is_frozen) WHERE is_frozen = true;

-- Auto-update timestamp trigger
CREATE TRIGGER update_escrow_deposits_timestamp
BEFORE UPDATE ON escrow_deposits
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ==============================================
-- 2. CREATE PAYMENT_HISTORY TABLE
-- ==============================================

CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id UUID NULL REFERENCES milestones(id) ON DELETE SET NULL,
  transaction_type VARCHAR(20) NOT NULL CHECK (
    transaction_type IN ('deposit', 'release', 'fee_collection', 'freeze', 'unfreeze', 'dispute_resolution')
  ),
  amount DECIMAL(20,6) NOT NULL CHECK (amount >= 0),
  from_address VARCHAR(42) NOT NULL,
  to_address VARCHAR(42) NOT NULL,
  tx_hash VARCHAR(66) NOT NULL UNIQUE,
  block_number BIGINT NOT NULL,
  block_timestamp TIMESTAMP NOT NULL,
  platform_fee DECIMAL(20,6) NULL,
  developer_payment DECIMAL(20,6) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE payment_history IS 'Immutable audit trail of all escrow transactions';
COMMENT ON COLUMN payment_history.transaction_type IS 'Type: deposit, release, fee_collection, freeze, unfreeze, dispute_resolution';
COMMENT ON COLUMN payment_history.tx_hash IS 'Blockchain transaction hash (unique)';
COMMENT ON COLUMN payment_history.block_timestamp IS 'Authoritative timestamp from blockchain';
COMMENT ON COLUMN payment_history.platform_fee IS 'Platform fee amount (for release transactions)';
COMMENT ON COLUMN payment_history.developer_payment IS 'Developer payment amount (for release transactions)';

-- Indexes
CREATE INDEX idx_payment_project ON payment_history(project_id);
CREATE INDEX idx_payment_milestone ON payment_history(milestone_id);
CREATE INDEX idx_payment_tx_hash ON payment_history(tx_hash);
CREATE INDEX idx_payment_type ON payment_history(transaction_type);
CREATE INDEX idx_payment_timestamp ON payment_history(block_timestamp DESC);
CREATE INDEX idx_payment_from_address ON payment_history(from_address);
CREATE INDEX idx_payment_to_address ON payment_history(to_address);

-- Prevent updates and deletes (immutable table)
CREATE OR REPLACE FUNCTION prevent_payment_history_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'payment_history is immutable - updates and deletes are not allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_payment_history_update
BEFORE UPDATE ON payment_history
FOR EACH ROW
EXECUTE FUNCTION prevent_payment_history_modification();

CREATE TRIGGER prevent_payment_history_delete
BEFORE DELETE ON payment_history
FOR EACH ROW
EXECUTE FUNCTION prevent_payment_history_modification();

-- ==============================================
-- 3. ALTER PROJECTS TABLE - ADD ESCROW FIELDS
-- ==============================================

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS escrow_deposited BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS escrow_deposit_tx_hash VARCHAR(66) NULL,
ADD COLUMN IF NOT EXISTS escrow_deposited_at TIMESTAMP NULL;

COMMENT ON COLUMN projects.escrow_deposited IS 'Whether initial escrow deposit has been made';
COMMENT ON COLUMN projects.escrow_deposit_tx_hash IS 'Transaction hash of escrow deposit';
COMMENT ON COLUMN projects.escrow_deposited_at IS 'When escrow was deposited';

-- Create index for querying projects with/without escrow
CREATE INDEX idx_projects_escrow_deposited ON projects(escrow_deposited);

-- ==============================================
-- 4. ALTER MILESTONES TABLE - ADD PAYMENT FIELDS
-- ==============================================

ALTER TABLE milestones
ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(20,6) NULL CHECK (payment_amount >= 0),
ADD COLUMN IF NOT EXISTS platform_fee DECIMAL(20,6) NULL CHECK (platform_fee >= 0),
ADD COLUMN IF NOT EXISTS payment_tx_hash VARCHAR(66) NULL,
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP NULL;

COMMENT ON COLUMN milestones.payment_amount IS 'Actual amount paid to developer (budget minus platform fee)';
COMMENT ON COLUMN milestones.platform_fee IS 'Platform fee deducted from milestone budget';
COMMENT ON COLUMN milestones.payment_tx_hash IS 'Blockchain transaction hash for payment release';
COMMENT ON COLUMN milestones.paid_at IS 'When payment was released to developer';

-- Create index for querying paid/unpaid milestones
CREATE INDEX idx_milestones_paid_at ON milestones(paid_at);
CREATE INDEX idx_milestones_payment_tx_hash ON milestones(payment_tx_hash);

-- ==============================================
-- 5. DATA VALIDATION FUNCTIONS
-- ==============================================

-- Function to validate escrow has sufficient balance before milestone approval
CREATE OR REPLACE FUNCTION validate_escrow_balance_for_milestone()
RETURNS TRIGGER AS $$
DECLARE
  available_balance DECIMAL(20,6);
  milestone_budget DECIMAL(20,6);
BEGIN
  -- Only check when milestone is being marked as completed
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Get milestone budget
    milestone_budget := NEW.budget;

    -- Get available escrow balance
    SELECT escrow_balance INTO available_balance
    FROM escrow_deposits
    WHERE project_id = NEW.project_id;

    -- Check if sufficient balance
    IF available_balance IS NULL THEN
      RAISE EXCEPTION 'No escrow found for project %', NEW.project_id;
    END IF;

    IF available_balance < milestone_budget THEN
      RAISE EXCEPTION 'Insufficient escrow balance: available % USDC, required % USDC',
        available_balance, milestone_budget;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_milestone_escrow_balance
BEFORE UPDATE ON milestones
FOR EACH ROW
EXECUTE FUNCTION validate_escrow_balance_for_milestone();

-- ==============================================
-- 6. PROJECT STATUS VALIDATION - REQUIRE ESCROW
-- ==============================================

-- Function to ensure project has escrow before going active
CREATE OR REPLACE FUNCTION validate_project_escrow_before_active()
RETURNS TRIGGER AS $$
BEGIN
  -- Check when project is transitioning to active
  IF NEW.status = 'active' AND OLD.status != 'active' THEN
    IF NOT NEW.escrow_deposited THEN
      RAISE EXCEPTION 'Cannot activate project without escrow deposit';
    END IF;

    -- Verify escrow record exists
    IF NOT EXISTS (SELECT 1 FROM escrow_deposits WHERE project_id = NEW.id) THEN
      RAISE EXCEPTION 'Escrow deposit record not found for project %', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_project_requires_escrow
BEFORE UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION validate_project_escrow_before_active();

-- ==============================================
-- 7. GRANT PERMISSIONS (if needed)
-- ==============================================

-- Grant permissions to application user (adjust username as needed)
-- GRANT SELECT, INSERT, UPDATE ON escrow_deposits TO app_user;
-- GRANT SELECT, INSERT ON payment_history TO app_user;
-- GRANT SELECT, INSERT, UPDATE ON projects TO app_user;
-- GRANT SELECT, INSERT, UPDATE ON milestones TO app_user;

-- ==============================================
-- MIGRATION COMPLETE
-- ==============================================

-- Record migration in system_state
INSERT INTO system_state (key, value, updated_at)
VALUES ('migration_003_escrow', '{"status": "completed", "timestamp": "' || NOW() || '"}', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
