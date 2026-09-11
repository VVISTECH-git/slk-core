-- The workbook's own list, once trimmed of CSS cruft on 0047, still asked a
-- colour to be found by scanning past Dark Magenta, Dark Olive Green and
-- Light Sky Blue to reach Peach — forty names where itokri's own storefront,
-- the reference this was checked against, filters on about fifteen. Cut
-- further, on the same reasoning 0047 already established: a colour is
-- found by scanning for a word.
--
-- What stays is either one of itokri's own fifteen families, or a real term
-- of the trade rather than a shade off a colour wheel: Navy, Teal, Rust,
-- Mustard, Golden, Silver, Indigo. Indigo especially — it names a dye and a
-- whole craft (Ajrakh), not a colour a shopper picked off a picker.
--
-- What retires folds into the family already kept: Bottle Green, Dark
-- Green, Dark Olive Green -> Green. Dark Blue, Light Sky Blue, Sky Blue ->
-- Blue. Turquoise -> Teal. Dark Magenta, Deep Pink, Hot Pink, Light Pink,
-- Magenta -> Pink. Lavender -> Purple. Dark Gray -> Gray. Dark Orange ->
-- Orange. Olive is not on this list — it stays, distinct from the Dark
-- Olive Green variant that retires into Green, on the same reasoning as
-- Indigo: too plain and common a name in its own right to fold away.
--
-- Retired rather than deleted, same reason as 0047: two of the eight test
-- consignments live on aartisanz and slk right now carry Dark Blue and
-- Bottle Green. Retiring does not touch what they already mean; it only
-- stops offering the name on a new record.
--
-- Confirmed against the 11 Sep conversation before this ran, not decided
-- alone: which fifteen-ish names actually match how the floor and the
-- weavers talk about a saree is a business call, not a scan of a
-- competitor's filter.

UPDATE "lookup_value"
SET "status" = 'retired',
    "is_default" = false,
    "needs_review" = false,
    "updated_at" = now()
WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'colour')
  AND "status" <> 'retired'
  AND lower("label") IN (
    'bottle green', 'dark blue', 'dark gray', 'dark green', 'dark magenta',
    'dark olive green', 'dark orange', 'deep pink', 'hot pink', 'lavender',
    'light pink', 'light sky blue', 'magenta', 'sky blue', 'turquoise'
  );--> statement-breakpoint

UPDATE "lookup_list"
SET "description" = 'The colours the trade actually names, cut twice now — 0047 retired the CSS named-colour set 0024 added, 0049 retired the workbook''s own finer shade variants down to about itokri''s fifteen families plus the real dye/trade terms (Indigo, Rust, Mustard...). Retired, not deleted: old records keep what they carry.',
    "updated_at" = now()
WHERE "code" = 'colour';
