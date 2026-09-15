-- What the cloth itself is made of — Cotton, Silk. Points at Product
-- Management's own "Fibre Type" list (lookup_list.code = 'fibre_type')
-- rather than a second, disconnected vocabulary for the same fact.
alter table cloth_item add column fibre_type_id uuid references lookup_value(id);
