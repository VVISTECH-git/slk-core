-- The actor table exists to answer 'who was counting' when a floor count and
-- the system disagree — its own comment says so. The ledger could not answer
-- it: movement recorded what moved, when, and between which places, and
-- nothing at all about the person who typed it.
--
-- Nullable, and it stays nullable. Every movement written before this column
-- existed has no answer, and a default would invent one — attributing last
-- month's deliveries to whoever happens to sign in next is worse than an
-- honest blank. The screens read a blank as 'before we recorded this'.
--
-- RESTRICT on delete, matching every other reference in the ledger: an actor
-- who has touched stock cannot be removed, which is the same reason actors are
-- deactivated rather than deleted.
--
-- Indexed by actor and then by time, because it is asked as 'what has this
-- person been doing' and never as a filter on a scan.

ALTER TABLE "movement" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movement_actor_idx" ON "movement" USING btree ("actor_id","occurred_at");