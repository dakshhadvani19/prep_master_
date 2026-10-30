-- Reverse the temporary rating addition. The active feedback form stores no rating.
-- Keep this migration after 20261030121639_add_feedback_rating so a fresh database
-- ends with the original Feedbacks schema and no Rating column.

BEGIN;

ALTER TABLE public."Feedbacks"
    DROP COLUMN IF EXISTS "Rating";

COMMIT;

NOTIFY pgrst, 'reload schema';
