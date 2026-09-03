-- The ledger refused DELETE as well as UPDATE, and that conflated two
-- different acts.
--
-- Editing a movement is tampering: it makes the count stop being explicable
-- by the events that produced it, and no amount of authority should allow it.
-- That stays refused, for everyone, forever.
--
-- Removing a record and everything under it is a different statement — "this
-- should never have existed". Test data, a delivery entered against the wrong
-- design, a line created twice. There was no way to say it: the app could only
-- archive, which hides a record while its stock goes on counting towards the
-- location totals, and the only route to a real deletion was a script with a
-- localhost guard. So the answer to "how do I get rid of this" was, in
-- practice, "you cannot".
--
-- Narrowed rather than dropped. UPDATE is still impossible, so a movement can
-- never be quietly altered; a DELETE can only be reached through an owner-only
-- action that removes the whole chain in one transaction, so what goes is a
-- record and all of its history together rather than an inconvenient row out
-- of the middle of it.

DROP TRIGGER IF EXISTS "movement_no_change" ON "movement";--> statement-breakpoint

CREATE TRIGGER "movement_no_change"
  BEFORE UPDATE ON "movement"
  FOR EACH ROW EXECUTE FUNCTION movement_is_append_only();--> statement-breakpoint

-- The message named only editing anyway; now it is the only thing it refuses.
CREATE OR REPLACE FUNCTION movement_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'movement is append-only — record a correction instead of editing row %',
    OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

COMMENT ON TRIGGER "movement_no_change" ON "movement" IS
  'A movement can never be edited. Deleting one is possible only as part of deleting the record it belongs to, which an owner does through the app and which takes the whole chain with it.';
