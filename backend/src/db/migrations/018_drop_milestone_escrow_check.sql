-- Migration 018: drop the milestones-side escrow balance check trigger.
--
-- Background: validate_escrow_balance_for_milestone fires on every milestone
-- UPDATE that flips status to 'completed', and refuses if
-- escrow_deposits.escrow_balance < milestones.budget. The intent was a sanity
-- check on top of the standard approveMilestone path. In practice it:
--   (a) duplicates a check the chain already enforces inside approveMilestone
--       (the chain reverts if escrow can't pay, and the DB only mirrors
--       confirmed events), and
--   (b) blocks the dispute-resolution path: when finalizeResolution closes
--       remaining milestones after the escrow has been emptied lump-sum,
--       this trigger refuses every flip.
--
-- Removing both the trigger and the function. If we ever want a DB-side
-- belt-and-suspenders check, it should be aware of the dispute path.

DROP TRIGGER IF EXISTS validate_milestone_escrow_balance ON milestones;
DROP FUNCTION IF EXISTS validate_escrow_balance_for_milestone();
