-- Blouse Material is asked again.
--
-- It was switched off on the live screen and its four values retired with it,
-- so the field on Additional Product Details rendered as nothing — a question
-- on the list of things to ask, with no way to answer it.
--
-- Done as a migration rather than by hand on the screen, because the two
-- databases have already drifted once: Saree Style was built by moving values
-- that were no longer there to move, and the list arrived empty. A statement
-- of what should be true runs on both and can run twice.
--
-- Reversible from the screen either way: switch the classification off on
-- Master Lists and the field goes again, with no deploy.

UPDATE "lookup_list"
SET "is_enabled" = true,
    "status" = 'active',
    "updated_at" = now()
WHERE "code" = 'blouse_material';--> statement-breakpoint

-- Only the ones retired wholesale with the list. A value someone retires on
-- its own afterwards stays retired, because this looks for nothing but the
-- state the switch-off left behind.
UPDATE "lookup_value"
SET "status" = 'active', "updated_at" = now()
WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'blouse_material')
  AND "status" = 'retired';
