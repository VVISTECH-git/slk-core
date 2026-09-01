-- Which photographs a product needs, as a controlled list.
--
-- `image.slot` was free text with the four saree parts named in a comment,
-- which meant the app knew about Body, Pallu, Border and Blouse and nobody
-- else could add a fifth. SLK wants to add their own — a Zari close-up, a
-- drape shot — so it becomes a lookup list like everything else, maintained
-- on Master Lists rather than in this file.

INSERT INTO "lookup_list" ("code", "label", "description", "sort_order")
VALUES (
  'image_slot',
  'Image Slot',
  'The photographs a product carries. Body, Pallu, Border and Blouse are the parts a saree is judged by; add more and they are offered on every record.',
  0
)
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint

INSERT INTO "lookup_value" ("list_id", "code", "label", "sort_order")
SELECT
  (SELECT "id" FROM "lookup_list" WHERE "code" = 'image_slot'),
  s.code, s.label, s.ord
FROM (VALUES
  ('body',   'Body',   0),
  ('pallu',  'Pallu',  1),
  ('border', 'Border', 2),
  ('blouse', 'Blouse', 3)
) AS s(code, label, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM "lookup_value" v
  WHERE v."list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'image_slot')
    AND v."code" = s.code
);--> statement-breakpoint

ALTER TABLE "image" ADD COLUMN "slot_id" uuid
  REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint

-- No rows to migrate: nothing has ever been uploaded, because there is
-- nowhere to upload to yet.
ALTER TABLE "image" DROP COLUMN "slot";--> statement-breakpoint

-- A slot chosen but not yet filled.
--
-- Choosing which photographs a product needs and taking them are different
-- acts, usually days apart and often by different people. A row with a slot
-- and no file is the list of what is still to be shot — which is a more
-- useful thing to be able to ask for than a table that only knows about
-- photographs that already exist.
ALTER TABLE "image" ALTER COLUMN "storage_key" DROP NOT NULL;--> statement-breakpoint

-- One row per slot per colourway. Ticking Pallu twice is not two
-- photographs, it is the same intention recorded twice.
CREATE UNIQUE INDEX "image_colourway_slot_key"
  ON "image" ("colourway_id", "slot_id");
