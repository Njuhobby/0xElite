CREATE TABLE IF NOT EXISTS pending_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(30) NOT NULL,
  entity_id VARCHAR(66) NOT NULL,
  action VARCHAR(30) NOT NULL,
  tx_hash VARCHAR(66) NOT NULL UNIQUE,
  wallet_address VARCHAR(42) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
