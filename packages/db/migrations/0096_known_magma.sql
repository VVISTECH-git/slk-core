ALTER TABLE "pile" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pile_event" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "pile" CASCADE;--> statement-breakpoint
DROP TABLE "pile_event" CASCADE;--> statement-breakpoint
-- CASCADE above already took this constraint with the table; IF EXISTS keeps the step honest either way.
ALTER TABLE "thaan" DROP CONSTRAINT IF EXISTS "thaan_pile_id_pile_id_fk";
--> statement-breakpoint
DROP INDEX "thaan_pile_id_idx";--> statement-breakpoint
ALTER TABLE "thaan" DROP COLUMN "pile_id";--> statement-breakpoint
-- Hand-added in 0092, so drizzle never tracked it; gone with the table it numbered.
DROP SEQUENCE IF EXISTS "pile_code_seq";
