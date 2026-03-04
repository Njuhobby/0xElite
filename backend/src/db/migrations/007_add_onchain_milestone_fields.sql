-- Migration 007: Add on-chain milestone fields for ProjectManager V2
-- Adds details_hash and on_chain_index to milestones table
-- Adds uses_onchain_milestones flag to projects table

ALTER TABLE milestones ADD COLUMN IF NOT EXISTS details_hash VARCHAR(66);
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS on_chain_index SMALLINT;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS uses_onchain_milestones BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_milestones_on_chain ON milestones(project_id, on_chain_index);
