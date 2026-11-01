BEGIN;

ALTER TABLE private.exam_attempt_evaluations
    ADD COLUMN IF NOT EXISTS claim_token uuid;

CREATE OR REPLACE FUNCTION public.pm_private_exam_evaluation_claim(
    p_attempt_id uuid,
    p_user_id uuid,
    p_answer_revision bigint,
    p_claim_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_eval private.exam_attempt_evaluations%ROWTYPE;
BEGIN
    IF p_attempt_id IS NULL OR p_user_id IS NULL OR p_claim_token IS NULL THEN
        RAISE EXCEPTION 'A valid attempt, user, and claim token are required';
    END IF;

    UPDATE private.exam_attempt_evaluations e
    SET status = 'evaluating',
        attempts = e.attempts + 1,
        claim_token = p_claim_token,
        started_at = now(),
        completed_at = NULL,
        error = NULL,
        updated_at = now()
    FROM private.exam_attempts a
    WHERE e.attempt_id = p_attempt_id
      AND e.answer_revision = p_answer_revision
      AND a.id = e.attempt_id
      AND a.user_id = p_user_id
      AND a.attempt_type = 'exam'
      AND a.answer_revision = p_answer_revision
      AND a.status IN ('submitted', 'auto_submitted')
      AND (
          e.status IN ('pending', 'failed')
          OR (e.status = 'evaluating' AND e.started_at < now() - interval '3 minutes')
      )
    RETURNING e.* INTO v_eval;

    IF FOUND THEN
        RETURN jsonb_build_object('claimed', true, 'evaluation', to_jsonb(v_eval));
    END IF;

    SELECT e.* INTO v_eval
    FROM private.exam_attempt_evaluations e
    JOIN private.exam_attempts a ON a.id = e.attempt_id
    WHERE e.attempt_id = p_attempt_id
      AND a.user_id = p_user_id
      AND a.attempt_type = 'exam';

    IF FOUND THEN
        RETURN jsonb_build_object('claimed', false, 'evaluation', to_jsonb(v_eval));
    END IF;
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pm_private_exam_evaluation_finish(
    p_attempt_id uuid,
    p_user_id uuid,
    p_answer_revision bigint,
    p_claim_token uuid,
    p_status text,
    p_result jsonb DEFAULT NULL,
    p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_eval private.exam_attempt_evaluations%ROWTYPE;
BEGIN
    IF p_status NOT IN ('completed', 'failed') THEN
        RAISE EXCEPTION 'Invalid evaluation completion status';
    END IF;
    IF p_status = 'completed' AND (p_result IS NULL OR jsonb_typeof(p_result) <> 'object') THEN
        RAISE EXCEPTION 'A completed evaluation requires a result object';
    END IF;

    UPDATE private.exam_attempt_evaluations e
    SET status = p_status,
        result = CASE WHEN p_status = 'completed' THEN p_result ELSE NULL END,
        error = CASE WHEN p_status = 'failed'
            THEN LEFT(COALESCE(NULLIF(p_error, ''), 'Evaluation failed. Please retry.'), 500)
            ELSE NULL END,
        completed_at = now(),
        updated_at = now()
    FROM private.exam_attempts a
    WHERE e.attempt_id = p_attempt_id
      AND e.answer_revision = p_answer_revision
      AND e.claim_token = p_claim_token
      AND e.status = 'evaluating'
      AND a.id = e.attempt_id
      AND a.user_id = p_user_id
      AND a.answer_revision = p_answer_revision
      AND a.status IN ('submitted', 'auto_submitted')
    RETURNING e.* INTO v_eval;

    RETURN CASE WHEN FOUND THEN to_jsonb(v_eval) ELSE NULL END;
END;
$function$;

REVOKE ALL ON FUNCTION public.pm_private_exam_evaluation_claim(uuid, uuid, bigint, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pm_private_exam_evaluation_finish(uuid, uuid, bigint, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pm_private_exam_evaluation_claim(uuid, uuid, bigint, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_private_exam_evaluation_finish(uuid, uuid, bigint, uuid, text, jsonb, text) TO service_role;

COMMIT;
