-- Whether Thaans from this bale go through Second Print at all. Defaults
-- to true so every bale on file today keeps behaving exactly as it does
-- now — every Thaan does every stage — until someone explicitly opts one
-- out at intake.
alter table bale add column needs_second_print boolean not null default true;
