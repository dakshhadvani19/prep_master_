-- Remove the superseded TestData claim RPC. The current API calls
-- pm_exam_source_paper_claim instead, and no database object depends on this RPC.

DROP FUNCTION IF EXISTS public.pm_exam_usage_claim_source_test(uuid, uuid, bigint);
NOTIFY pgrst, 'reload schema';
