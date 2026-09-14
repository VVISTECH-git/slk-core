-- Bale codes switch from "supplier letter + per-supplier counter" (A1, G1)
-- to one plain running number for every bale, starting at 1001 — matching
-- how Thaan codes now work. A deliberate reversal of the earlier choice to
-- keep the old per-supplier letters; the client asked for the simpler
-- scheme instead.
--
-- Existing bales keep their old codes as-is — this only changes how new
-- ones are minted, the same way restarting `thaan_code_seq` did not touch
-- Thaans already coded.
--
-- `supplier.next_bale_number` fed the old scheme exclusively and has no
-- other reader, so it goes. `supplier.code_prefix` stays: it no longer
-- feeds a bale's own code, but it's still a short reference for the
-- supplier itself, and nothing here asked for it to go too.

CREATE SEQUENCE "bale_code_seq" START WITH 1001;--> statement-breakpoint

ALTER TABLE "supplier" DROP COLUMN "next_bale_number";
