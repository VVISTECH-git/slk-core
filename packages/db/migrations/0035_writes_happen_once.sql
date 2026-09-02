-- A write happens once, however many times it is asked for.
--
-- Found the hard way. During the first end-to-end test from the phone, the
-- emulator's network dropped between the request committing and the response
-- coming back. The app showed "cannot reach the server", the tester pressed
-- Create again, and the catalogue gained SAR-GEN-COT-0009 — a second design, a
-- second consignment and six more item codes for one delivery of six sarees.
--
-- The app cannot tell "it never arrived" from "the answer was lost", and a
-- warehouse is exactly where that happens. So the caller names each attempt
-- and the server remembers the name: the key is claimed BEFORE the work and
-- completed after, so a repeat while the first is still running is refused
-- rather than raced, and a repeat afterwards is answered with what the first
-- one made.
--
-- Item codes 500090-500095 were burned by that duplicate and will never be
-- reissued, which is correct — a code that has been printed must not come
-- back — but they were burned for nothing.

CREATE TABLE "idempotency" (
	"key" text PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"result_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "idempotency" ADD CONSTRAINT "idempotency_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actor"("id") ON DELETE cascade ON UPDATE no action;