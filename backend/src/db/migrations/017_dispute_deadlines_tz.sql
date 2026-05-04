-- Migration 017: switch dispute deadline columns to TIMESTAMPTZ.
--
-- Background: handleCreateDispute / handleStartVoting in pendingTxActions
-- insert a JS `new Date(epoch*1000)` value into these columns. With the old
-- TIMESTAMP WITHOUT TIME ZONE type, the pg driver wrote the wall-clock
-- representation in the Node process's local timezone — which then read back
-- as if it were already in the Postgres session timezone, silently shifting
-- by the offset. That broke `evidence_deadline < NOW()` comparisons in the
-- consistencyScheduler sweeps.
--
-- TIMESTAMPTZ stores UTC internally regardless of the inserter's timezone, so
-- the bridge between JS Date and SQL NOW() becomes unambiguous.
--
-- Existing rows are converted using the current session timezone. For local
-- debug this is acceptable — any rows that landed under the bug are already
-- wrong and will be re-created.

ALTER TABLE disputes
  ALTER COLUMN evidence_deadline TYPE TIMESTAMPTZ
    USING evidence_deadline AT TIME ZONE 'UTC';

ALTER TABLE disputes
  ALTER COLUMN voting_deadline TYPE TIMESTAMPTZ
    USING voting_deadline AT TIME ZONE 'UTC';
