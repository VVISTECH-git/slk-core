-- A design can be more than one adjective.
--
-- Descriptor was one column holding one value, so a saree could be Soft or
-- Pure but never both, and the person filing it had to decide which half of
-- the truth to keep. It is the only attribute where that is wrong: every
-- other one answers a question with exactly one answer — a fibre, a product
-- type, a border height — and this one is a list of adjectives.
--
-- A join table rather than an array column. The values are lookup values like
-- every other, and a real foreign key per row is what stops a descriptor
-- being deleted while designs still carry it, the same protection every other
-- attribute already has.

CREATE TABLE IF NOT EXISTS "design_descriptor" (
  "design_id" uuid NOT NULL REFERENCES "design"("id") ON DELETE CASCADE,
  "descriptor_id" uuid NOT NULL REFERENCES "lookup_value"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("design_id", "descriptor_id")
);--> statement-breakpoint

-- Deleting a design takes its descriptors with it; deleting a descriptor that
-- designs use is refused. Hence CASCADE on one side and RESTRICT on the
-- other, which is not a symmetry anyone should have to guess at.
CREATE INDEX IF NOT EXISTS "design_descriptor_value_idx"
  ON "design_descriptor" ("descriptor_id");--> statement-breakpoint

-- What each design already said, said again in the new shape.
INSERT INTO "design_descriptor" ("design_id", "descriptor_id")
SELECT "id", "descriptor_id" FROM "design" WHERE "descriptor_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- `design.descriptor_id` stays, unread. Dropping it would throw away the
-- record of what the single answer used to be while this is still settling,
-- and it costs a column.
COMMENT ON COLUMN "design"."descriptor_id" IS
  'Superseded by design_descriptor. Kept for the historical single value; nothing reads it.';
