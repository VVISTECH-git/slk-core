-- What end product(s) a cloth item is suited to — "Sarees", "Fabric",
-- "Chunnies", "Bedsheets", "Pillow Covers". A set, not a single choice, the
-- same shape as vendor.stages. Empty by default: nothing forces an answer
-- for cloth already on file until someone sets it.
alter table cloth_item add column cloth_types text[] not null default '{}'::text[];

-- Saree-specific facts about the raw cloth itself — true the day the bale
-- arrives, before any cutting or finishing — not the design-level choices
-- Product Management already owns (Audience, Print Technique, colour...).
-- All three stay null for anything that isn't a saree cloth, and null on a
-- saree cloth item until someone actually sets them.
alter table cloth_item add column has_blouse boolean;
alter table cloth_item add column border text;
alter table cloth_item add column pallu text;

alter table cloth_item add constraint cloth_item_border_known
  check (border is null or border in ('Zari', 'Plain', 'Contrast', 'Tasseled'));
alter table cloth_item add constraint cloth_item_pallu_known
  check (pallu is null or pallu in ('Same as body', 'Contrast'));
