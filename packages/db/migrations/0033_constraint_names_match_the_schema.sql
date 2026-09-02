-- Nineteen constraints, given the name the schema already calls them by.
--
-- Migrations 0004–0031 were written by hand, and hand-written SQL that says
--
--   REFERENCES "lookup_value"("id")
--
-- lets Postgres name the constraint, which it does as design_motif_id_fkey.
-- drizzle-kit names the same constraint design_motif_id_lookup_value_id_fk.
-- Same columns, same target, same ON DELETE — different name.
--
-- Nothing reads a constraint name at runtime: the pg_constraint queries in
-- the app all filter on contype and confrelid, and the two places that could
-- surface a violation to a person deliberately check first so the message is
-- a sentence rather than an identifier. So this has been invisible.
--
-- It stops being invisible the first time something drops or renames one of
-- them. meta/0032_snapshot.json — the baseline drizzle-kit diffs against — is
-- the serialisation of src/schema, so it holds the Drizzle name. Generated
-- DDL would name a constraint the database does not have, and fail.
--
-- Renaming is metadata only. No table is rewritten, no data is read, no index
-- is rebuilt; a primary key's backing index follows its constraint's name.
--
-- The database moves to meet the snapshot rather than the other way round,
-- because the alternative is teaching src/schema nineteen exceptions.

-- ── The renames ───────────────────────────────────────────────────────────
--
-- Stated as a list because that is what they are. Each is applied only when
-- the old name is present and the new one is not, so this is safe to re-run
-- and safe on a database where some of it has already happened — which the
-- two databases have taught us to assume.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('batch',             'batch_colourway_id_fkey',              'batch_colourway_id_colourway_id_fk'),
      ('batch',             'batch_location_id_fkey',               'batch_location_id_location_id_fk'),
      ('colourway',         'colourway_secondary_colour_id_fkey',   'colourway_secondary_colour_id_lookup_value_id_fk'),
      ('design',            'design_blouse_border_id_fkey',         'design_blouse_border_id_lookup_value_id_fk'),
      ('design',            'design_blouse_motif_id_fkey',          'design_blouse_motif_id_lookup_value_id_fk'),
      ('design',            'design_blouse_style_id_fkey',          'design_blouse_style_id_lookup_value_id_fk'),
      ('design',            'design_border_motif_id_fkey',          'design_border_motif_id_lookup_value_id_fk'),
      ('design',            'design_pallu_motif_id_fkey',           'design_pallu_motif_id_lookup_value_id_fk'),
      ('design',            'design_saree_body_motif_id_fkey',      'design_saree_body_motif_id_lookup_value_id_fk'),
      ('design',            'design_saree_style_id_fkey',           'design_saree_style_id_lookup_value_id_fk'),
      ('design',            'design_textile_material_id_fkey',      'design_textile_material_id_lookup_value_id_fk'),
      ('design_descriptor', 'design_descriptor_descriptor_id_fkey', 'design_descriptor_descriptor_id_lookup_value_id_fk'),
      ('design_descriptor', 'design_descriptor_design_id_fkey',     'design_descriptor_design_id_design_id_fk'),
      ('design_descriptor', 'design_descriptor_pkey',               'design_descriptor_design_id_descriptor_id_pk'),
      ('image',             'image_slot_id_fkey',                   'image_slot_id_lookup_value_id_fk'),
      ('lookup_list',       'lookup_list_parent_list_id_fkey',      'lookup_list_parent_list_id_lookup_list_id_fk'),
      ('lookup_value',      'lookup_value_sold_by_id_fkey',         'lookup_value_sold_by_id_lookup_value_id_fk'),
      ('movement',          'movement_batch_id_fkey',               'movement_batch_id_batch_id_fk'),
      ('piece',             'piece_batch_id_fkey',                  'piece_batch_id_batch_id_fk')
    ) AS t(tbl, old_name, new_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = r.tbl::regclass AND conname = r.old_name
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = r.tbl::regclass AND conname = r.new_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I RENAME CONSTRAINT %I TO %I',
        r.tbl, r.old_name, r.new_name
      );
    END IF;
  END LOOP;
END $$;
