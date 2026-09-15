-- One row per `recordThaans` call, appended rather than overwritten —
-- bale.cut_by_id/updated_at only ever hold whoever touched the bale's
-- cutting status last, so a bale cut in more than one session by more
-- than one person loses every earlier session's actor and time. This
-- table keeps all of them.
create table "bale_cutting_event" (
  "id" uuid primary key default gen_random_uuid(),
  "bale_id" uuid not null references "bale"("id") on delete cascade,
  "actor_id" uuid references "actor"("id") on delete restrict,
  "count" integer not null,
  "recorded_at" timestamp with time zone not null default now()
);

create index "bale_cutting_event_bale_idx" on "bale_cutting_event" using btree ("bale_id");
