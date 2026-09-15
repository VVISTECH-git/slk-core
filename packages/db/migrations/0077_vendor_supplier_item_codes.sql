-- System-generated, immutable codes for vendor (V801, V802, ...), supplier
-- (S701, S702, ...) and cloth_item (I401, I402, ...) — one running sequence
-- per table, the same pattern bale_code_seq/thaan_code_seq already use.
--
-- Distinct from supplier.code_prefix, which stays exactly as it is: that's
-- a hand-picked letter chosen when a supplier is added, this is a number
-- nobody types, assigned the moment a row is created.

create sequence vendor_code_seq start with 801;
create sequence supplier_code_seq start with 701;
create sequence cloth_item_code_seq start with 401;

alter table vendor add column code text;
alter table supplier add column code text;
alter table cloth_item add column code text;

-- Backfill whatever's already on file, oldest first, then move each
-- sequence past the numbers just handed out so the next real insert
-- continues cleanly from there.
with ordered as (
  select id, row_number() over (order by created_at) as rn from vendor
)
update vendor v set code = 'V' || (800 + ordered.rn)
from ordered where v.id = ordered.id;
select setval('vendor_code_seq', 800 + (select count(*) from vendor));

with ordered as (
  select id, row_number() over (order by created_at) as rn from supplier
)
update supplier s set code = 'S' || (700 + ordered.rn)
from ordered where s.id = ordered.id;
select setval('supplier_code_seq', 700 + (select count(*) from supplier));

with ordered as (
  select id, row_number() over (order by created_at) as rn from cloth_item
)
update cloth_item i set code = 'I' || (400 + ordered.rn)
from ordered where i.id = ordered.id;
select setval('cloth_item_code_seq', 400 + (select count(*) from cloth_item));

alter table vendor alter column code set not null;
alter table supplier alter column code set not null;
alter table cloth_item alter column code set not null;

create unique index "vendor_code_key" on "vendor" using btree ("code");
create unique index "supplier_code_key" on "supplier" using btree ("code");
create unique index "cloth_item_code_key" on "cloth_item" using btree ("code");
