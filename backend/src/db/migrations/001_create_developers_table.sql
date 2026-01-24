-- Create developers table
CREATE TABLE IF NOT EXISTS developers (
  wallet_address VARCHAR(42) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  github_username VARCHAR(39) UNIQUE,
  skills JSONB NOT NULL,
  bio TEXT,
  hourly_rate DECIMAL(10,2),
  availability VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'busy', 'vacation')),
  stake_amount DECIMAL(20,6) NOT NULL DEFAULT 0,
  staked_at TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_developers_email ON developers(email);
CREATE INDEX IF NOT EXISTS idx_developers_github ON developers(github_username) WHERE github_username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_developers_status ON developers(status);
CREATE INDEX IF NOT EXISTS idx_developers_availability ON developers(availability) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_developers_created_at ON developers(created_at DESC);

-- Create system_state table for storing last processed block
CREATE TABLE IF NOT EXISTS system_state (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_developers_updated_at
  BEFORE UPDATE ON developers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
