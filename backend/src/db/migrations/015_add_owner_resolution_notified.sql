-- Migration 015: Track whether admins have been notified that a dispute
-- needs manual owner resolution (quorum not met after voting deadline).
-- Used by ConsistencyScheduler.sweepOverdueDisputes to dedupe notifications
-- so admins aren't spammed every sweep tick.

ALTER TABLE disputes
  ADD COLUMN IF NOT EXISTS owner_resolution_notified_at TIMESTAMP NULL;
