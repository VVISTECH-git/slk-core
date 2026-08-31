-- Border Style is retired; Border Height is kept.
--
-- The two overlapped and only one was wanted. The workbook already flagged
-- the whole Border Style column NEEDS REVIEW — four values for something as
-- varied as saree borders — while Border Height is four contiguous bands that
-- cover every case.
--
-- Retired rather than deleted, and this is the distinction the status column
-- exists for: designs already carry these values, and a record has to keep
-- meaning what it meant. They stop being offered on new records; they do not
-- stop being true of old ones.
--
-- `border_style_id` stays on `design` for the same reason. A column read by
-- nothing new but explaining eight existing records is not dead weight.

UPDATE "lookup_value"
SET "status" = 'retired',
    -- The question the flag asked — are four values enough for real stock? —
    -- is answered by retiring the list. Leaving it set would put four items
    -- in the Review inbox that nobody can act on.
    "needs_review" = false,
    "is_default" = false,
    "updated_at" = now()
WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'border_style');--> statement-breakpoint

UPDATE "lookup_list"
SET "description" = 'Retired in favour of Border Height, which covers the same ground in contiguous bands. Kept because existing designs carry these values.',
    "updated_at" = now()
WHERE "code" = 'border_style';
