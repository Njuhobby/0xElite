-- Migration 016: Drop uses_onchain_milestones flag
-- All projects are V2 (on-chain milestones) now; the V1 backend-mediated
-- approval path was removed along with createProject/assignDeveloper from
-- the contract. The flag had only ever been written as TRUE since V2 launch,
-- and after the cleanup it has no readers either.

ALTER TABLE projects DROP COLUMN IF EXISTS uses_onchain_milestones;
