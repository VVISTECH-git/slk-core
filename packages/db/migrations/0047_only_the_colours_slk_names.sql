-- Only the colours SLK names.
--
-- 0024 put the entire CSS named-colour set into the list — a hundred and three
-- names on top of the forty-four from the workbook — on the grounds that a
-- standard list costs nothing. It cost the dropdown: a colour is found by
-- scanning for a word, and nobody scans past Papaya Whip, Blanched Almond and
-- Rebecca Purple to find Peach. The first records made by hand on the live
-- screen chose Aquamarine, Azure and Alice Blue, which is what a list like
-- that does to the people using it.
--
-- Retired rather than deleted, because records already carry them — every
-- one of the hundred and forty-seven is on at least one colourway after the
-- bulk import — and a record has to keep meaning what it meant. They stop
-- being offered; they do not stop being true of old rows.
--
-- What stays is the workbook's own list, less the four it flagged NEEDS
-- REVIEW as web-palette names nobody says of cloth: Chartreuse, Dark Sea
-- Green, Dark Slate Blue, Ghost White. Retiring answers the flag, so it is
-- cleared rather than left in the Review inbox with nothing to act on.
--
-- Matched on the label, lower-cased, so it holds whichever convention the
-- code column happens to follow. Idempotent: run it twice and nothing moves.

UPDATE "lookup_value"
SET "status" = 'retired',
    "is_default" = false,
    "needs_review" = false,
    "updated_at" = now()
WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'colour')
  AND "status" <> 'retired'
  AND lower("label") NOT IN (
    'beige', 'black', 'blue', 'bottle green', 'brown', 'cream',
    'dark blue', 'dark gray', 'dark green', 'dark magenta', 'dark olive green',
    'dark orange', 'deep pink', 'golden', 'gray', 'green', 'hot pink', 'indigo',
    'lavender', 'light pink', 'light sky blue', 'magenta', 'maroon',
    'multicolour', 'mustard', 'navy', 'off white', 'olive', 'orange', 'peach',
    'pink', 'purple', 'red', 'rust', 'silver', 'sky blue', 'teal', 'turquoise',
    'white', 'yellow'
  );--> statement-breakpoint

UPDATE "lookup_list"
SET "description" = 'The colours SLK names, from the workbook. A colour is found by scanning for a word, so the list stays short; add one here when a weaver actually says it. The CSS named-colour set that 0024 added is retired, not deleted — old records still carry those names.',
    "updated_at" = now()
WHERE "code" = 'colour';
