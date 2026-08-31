-- Two descriptions that stopped being true.
--
-- Both said the list was "stored lower case", which was accurate until 0005
-- moved everything to Init Caps. The seed deliberately never updates an
-- existing row — a re-seed must not undo an edit made on Master Lists — so a
-- description it wrote can only be corrected here.

UPDATE "lookup_list"
SET "description" = 'Swatches are resolved from the name, so a new colour gets one without anyone picking a hex. Four web-palette names are flagged NEEDS REVIEW.',
    "updated_at" = now()
WHERE "code" = 'colour';--> statement-breakpoint

UPDATE "lookup_list"
SET "description" = 'Sales words, size words and duplicates of other columns were removed.',
    "updated_at" = now()
WHERE "code" = 'descriptor';
