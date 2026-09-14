-- Thaan codes and bale codes drew from separate sequences that both
-- happened to be short, plain numbers — so a bale "1004" and an unrelated
-- bale's Thaan "T1004" looked identical once the "T" was searched past
-- (see the Thaans page search fix in the same batch as this migration).
-- Padding Thaan codes to 8 digits gives them their own visual shape, and
-- restarting well clear of the numbers already in use for bale codes keeps
-- the two number lines from overlapping again for a long time.
--
-- Restarting the sequence doesn't touch already-issued codes; this project
-- deletes the handful of test Thaans issued before this migration
-- separately, so every code in the system ends up in the new shape.

ALTER SEQUENCE "thaan_code_seq" RESTART WITH 2001;
