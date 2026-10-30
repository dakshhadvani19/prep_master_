-- PrepMaster feedback rating
-- Adds a required 1–5 rating to the existing Feedbacks table.

BEGIN;

ALTER TABLE public."Feedbacks"
  ADD COLUMN "Rating" smallint NOT NULL
  CONSTRAINT "Feedbacks_Rating_range_check"
  CHECK ("Rating" BETWEEN 1 AND 5);

COMMENT ON COLUMN public."Feedbacks"."Rating"
  IS 'Required feedback rating from 1 (lowest) to 5 (highest).';

COMMIT;

NOTIFY pgrst, 'reload schema';
