-- entity_id needs to hold both UUIDs (projects) and wallet addresses (developers)
ALTER TABLE pending_transactions
  ALTER COLUMN entity_id TYPE VARCHAR(66) USING entity_id::text;
