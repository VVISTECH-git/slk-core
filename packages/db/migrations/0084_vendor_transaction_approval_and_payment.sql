-- Finance's sign-off and settlement, tracked per transaction rather than
-- only against a vendor's running balance — see vendorTransaction in
-- packages/db/src/schema/production.ts for why.
alter table vendor_transaction add column approved_at timestamp with time zone;
alter table vendor_transaction add column approved_by_id uuid references actor(id) on delete restrict;
alter table vendor_transaction add column paid_at timestamp with time zone;
alter table vendor_transaction add column vendor_payment_id uuid references vendor_payment(id) on delete set null;

create index vendor_transaction_vendor_payment_id_idx on vendor_transaction (vendor_payment_id);
create index vendor_transaction_unpaid_idx on vendor_transaction (vendor_id) where paid_at is null;
