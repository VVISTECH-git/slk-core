-- Restarting the running number Thaan codes are minted from. Safe as a
-- plain restart, not a data migration: nothing has been cut in production
-- yet, so no Thaan has ever actually been assigned a code from this
-- sequence.

ALTER SEQUENCE "thaan_code_seq" RESTART WITH 1001;
