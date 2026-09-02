-- Who is acting, and what lets them.
--
-- Hand-written rather than generated. drizzle-kit's snapshot baseline stopped
-- at 0003 while migrations 0004–0031 were written by hand, so `db:generate`
-- diffs the schema against a picture of the database from thirty-one
-- migrations ago and offers to re-create `batch`, `design_descriptor` and
-- every column added since. Until the baseline is rebuilt, new DDL is stated
-- here in full — which the folder's own note already allows for.
--
-- Two tables, matching packages/db/src/schema/access.ts:
--
--   actor        a person on the floor, or a machine that calls the API
--   actor_token  one sign-in — a phone that is currently trusted
--
-- No rows are created here. An actor has a PIN, and a credential committed to
-- a repository is a credential published; the first owner is created with
-- `pnpm db:actor`, which asks for the PIN and never writes it down.

CREATE TABLE IF NOT EXISTS "actor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'floor' NOT NULL,
	"secret_hash" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "actor_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "actor_token" ADD CONSTRAINT "actor_token_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "actor_code_key" ON "actor" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "actor_token_hash_key" ON "actor_token" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "actor_token_actor_idx" ON "actor_token" USING btree ("actor_id");
