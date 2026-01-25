-- Migration 002: Create project management tables
-- Creates: clients, projects, milestones tables
-- Modifies: developers table (add assignment tracking fields)

-- =====================================================
-- CLIENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS clients (
  wallet_address VARCHAR(42) PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  company_name VARCHAR(200),
  description TEXT,
  website VARCHAR(500),
  is_registered BOOLEAN NOT NULL DEFAULT FALSE,
  projects_created INTEGER NOT NULL DEFAULT 0,
  projects_completed INTEGER NOT NULL DEFAULT 0,
  total_spent DECIMAL(20,6) NOT NULL DEFAULT 0,
  reputation_score DECIMAL(3,2) CHECK (reputation_score >= 0 AND reputation_score <= 5),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for clients
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_registered ON clients(is_registered);
CREATE INDEX IF NOT EXISTS idx_clients_reputation ON clients(reputation_score DESC);

-- =====================================================
-- PROJECTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number SERIAL UNIQUE NOT NULL,
  client_address VARCHAR(42) NOT NULL REFERENCES clients(wallet_address),
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  required_skills JSONB NOT NULL,
  total_budget DECIMAL(20,6) NOT NULL CHECK (total_budget > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  assigned_developer VARCHAR(42) REFERENCES developers(wallet_address),
  assigned_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  contract_project_id BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_status CHECK (status IN ('draft', 'active', 'completed', 'disputed', 'cancelled'))
);

-- Indexes for projects
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_address);
CREATE INDEX IF NOT EXISTS idx_projects_developer ON projects(assigned_developer);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_contract_id ON projects(contract_project_id);

-- =====================================================
-- MILESTONES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_number INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  deliverables JSONB NOT NULL,
  budget DECIMAL(20,6) NOT NULL CHECK (budget > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP,
  submitted_at TIMESTAMP,
  completed_at TIMESTAMP,
  deliverable_urls JSONB,
  review_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_milestone_status CHECK (status IN ('pending', 'in_progress', 'pending_review', 'completed', 'disputed')),
  CONSTRAINT unique_milestone_number UNIQUE (project_id, milestone_number)
);

-- Indexes for milestones
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);

-- =====================================================
-- MODIFY DEVELOPERS TABLE
-- Add assignment tracking fields
-- =====================================================
ALTER TABLE developers
ADD COLUMN IF NOT EXISTS current_project_id UUID REFERENCES projects(id),
ADD COLUMN IF NOT EXISTS projects_completed INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_earned DECIMAL(20,6) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2) CHECK (average_rating >= 0 AND average_rating <= 5),
ADD COLUMN IF NOT EXISTS last_assignment_at TIMESTAMP;

-- Indexes for new developer fields
CREATE INDEX IF NOT EXISTS idx_developers_current_project ON developers(current_project_id);
CREATE INDEX IF NOT EXISTS idx_developers_availability ON developers(availability);
CREATE INDEX IF NOT EXISTS idx_developers_rating ON developers(average_rating DESC);

-- =====================================================
-- FUNCTIONS AND TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for clients table
DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for projects table
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for milestones table
DROP TRIGGER IF EXISTS update_milestones_updated_at ON milestones;
CREATE TRIGGER update_milestones_updated_at
  BEFORE UPDATE ON milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- VALIDATION FUNCTIONS
-- =====================================================

-- Function to validate milestone budgets sum to project budget
CREATE OR REPLACE FUNCTION validate_milestone_budgets()
RETURNS TRIGGER AS $$
DECLARE
  project_budget DECIMAL(20,6);
  milestones_total DECIMAL(20,6);
BEGIN
  -- Get project budget
  SELECT total_budget INTO project_budget
  FROM projects
  WHERE id = NEW.project_id;

  -- Calculate total milestone budgets
  SELECT COALESCE(SUM(budget), 0) INTO milestones_total
  FROM milestones
  WHERE project_id = NEW.project_id
  AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- Add new milestone budget
  milestones_total := milestones_total + NEW.budget;

  -- Validate
  IF milestones_total > project_budget THEN
    RAISE EXCEPTION 'Milestone budgets (%) exceed project budget (%)', milestones_total, project_budget;
  END IF;

  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to validate milestone budgets
DROP TRIGGER IF EXISTS validate_milestone_budget ON milestones;
CREATE TRIGGER validate_milestone_budget
  BEFORE INSERT OR UPDATE OF budget ON milestones
  FOR EACH ROW
  EXECUTE FUNCTION validate_milestone_budgets();

-- Function to sync developer availability with project assignment
CREATE OR REPLACE FUNCTION sync_developer_availability()
RETURNS TRIGGER AS $$
BEGIN
  -- If developer is assigned, set availability to 'busy'
  IF NEW.assigned_developer IS NOT NULL AND (OLD.assigned_developer IS NULL OR OLD.assigned_developer != NEW.assigned_developer) THEN
    UPDATE developers
    SET availability = 'busy',
        current_project_id = NEW.id,
        last_assignment_at = NOW()
    WHERE wallet_address = NEW.assigned_developer;
  END IF;

  -- If developer is unassigned (project completed/cancelled), set availability to 'available'
  IF NEW.status IN ('completed', 'cancelled') AND NEW.assigned_developer IS NOT NULL THEN
    UPDATE developers
    SET availability = 'available',
        current_project_id = NULL
    WHERE wallet_address = NEW.assigned_developer
    AND availability != 'vacation'; -- Don't override vacation status
  END IF;

  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to sync developer availability
DROP TRIGGER IF EXISTS sync_developer_availability_trigger ON projects;
CREATE TRIGGER sync_developer_availability_trigger
  AFTER UPDATE OF assigned_developer, status ON projects
  FOR EACH ROW
  EXECUTE FUNCTION sync_developer_availability();

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE clients IS 'Stores client profiles with optional registration';
COMMENT ON TABLE projects IS 'Stores project information with milestone breakdown and assignment tracking';
COMMENT ON TABLE milestones IS 'Stores individual deliverables within projects';

COMMENT ON COLUMN projects.status IS 'draft: awaiting assignment, active: developer working, completed: all done, disputed: under review, cancelled: terminated';
COMMENT ON COLUMN milestones.status IS 'pending: not started, in_progress: developer working, pending_review: submitted for review, completed: approved, disputed: under review';

COMMENT ON COLUMN clients.is_registered IS 'TRUE if client completed full profile, FALSE if minimal (wallet-only)';
COMMENT ON COLUMN projects.contract_project_id IS 'On-chain project ID from ProjectManager contract';
COMMENT ON COLUMN developers.current_project_id IS 'Currently assigned project (NULL if available)';
