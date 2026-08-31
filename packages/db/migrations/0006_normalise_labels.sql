-- Bring every stored label onto the rule the application writes with.
--
-- The invariant worth holding is `titleCase(label) = label`: a value that is
-- already correctly cased must survive a save untouched. Without it, opening
-- "Up to 3 inch" in the editor shows it as unsaved before anyone types, and
-- saving silently rewrites it.
--
-- The rule is @slk/domain's titleCase, restated here in SQL because a
-- migration cannot call it. The three parts must stay in step:
--
--   1. Capitalise the first letter of each word, leaving the rest alone, so
--      "Sico (Silk-Cotton Blend)" survives.
--   2. Minor words stay lower case unless first or last — otherwise
--      "Half and Half" becomes "Half And Half".
--   3. A word with a capital anywhere but the first character was cased
--      deliberately: 3D, UnStitched. Those are left exactly as they are.

CREATE FUNCTION pg_temp.title_case(input text) RETURNS text AS $$
DECLARE
  parts    text[];
  part     text;
  result   text := '';
  word_no  int  := 0;
  words    int;
  minor    text[] := ARRAY[
    'a','an','and','as','at','but','by','for','from','in','nor',
    'of','on','or','per','the','to','via','vs','with'
  ];
BEGIN
  -- Separators are captured as their own elements so spacing comes back
  -- exactly as it was.
  parts := regexp_split_to_array(input, '([[:space:](/-]+)');
  words := (SELECT count(*) FROM unnest(parts) p WHERE p <> '');

  FOREACH part IN ARRAY regexp_split_to_array(input, '(?=[[:space:](/-])|(?<=[[:space:](/-])')
  LOOP
    IF part ~ '^[[:space:](/-]+$' OR part = '' THEN
      result := result || part;
      CONTINUE;
    END IF;

    word_no := word_no + 1;

    IF word_no > 1 AND word_no < words AND lower(part) = ANY(minor) THEN
      result := result || lower(part);
    ELSIF substring(part from 2) ~ '[A-Z]' THEN
      result := result || part;
    ELSE
      result := result || upper(left(part, 1)) || substring(part from 2);
    END IF;
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;--> statement-breakpoint

UPDATE "lookup_value"
SET "label" = pg_temp.title_case("label"),
    "updated_at" = now()
WHERE "label" <> pg_temp.title_case("label");--> statement-breakpoint

UPDATE "lookup_list"
SET "label" = pg_temp.title_case("label"),
    "updated_at" = now()
WHERE "label" <> pg_temp.title_case("label");
