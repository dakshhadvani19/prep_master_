BEGIN;

CREATE TABLE IF NOT EXISTS private.exam_attempt_evaluations (
    attempt_id uuid PRIMARY KEY REFERENCES private.exam_attempts(id) ON DELETE CASCADE,
    answer_revision bigint NOT NULL,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'evaluating', 'completed', 'failed')),
    model text NOT NULL DEFAULT 'openai/gpt-oss-20b',
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 20),
    result jsonb,
    error text,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.exam_attempt_evaluations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.exam_attempt_evaluations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.exam_attempt_evaluations TO service_role;

CREATE OR REPLACE FUNCTION public.pm_private_exam_evaluation_data(
    p_action text,
    p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_attempt_id uuid;
    v_user_id uuid;
    v_revision bigint;
    v_attempt private.exam_attempts%ROWTYPE;
    v_eval private.exam_attempt_evaluations%ROWTYPE;
    v_result jsonb;
BEGIN
    IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
        RAISE EXCEPTION 'Payload must be a JSON object';
    END IF;

    v_attempt_id := NULLIF(p_payload->>'attempt_id', '')::uuid;
    v_user_id := NULLIF(p_payload->>'user_id', '')::uuid;
    v_revision := COALESCE(NULLIF(p_payload->>'answer_revision', '')::bigint, 0);

    CASE p_action
        WHEN 'upsert_pending' THEN
            SELECT * INTO v_attempt
            FROM private.exam_attempts a
            WHERE a.id = v_attempt_id AND a.user_id = v_user_id;

            IF NOT FOUND THEN RETURN NULL; END IF;
            IF v_attempt.attempt_type <> 'exam'
               OR v_attempt.status NOT IN ('submitted', 'auto_submitted') THEN
                RETURN NULL;
            END IF;

            INSERT INTO private.exam_attempt_evaluations AS current_eval (
                attempt_id, answer_revision, status, model, attempts,
                result, error, started_at, completed_at, created_at, updated_at
            ) VALUES (
                v_attempt.id, v_attempt.answer_revision, 'pending',
                'openai/gpt-oss-20b', 0, NULL, NULL, NULL, NULL, now(), now()
            )
            ON CONFLICT (attempt_id) DO UPDATE SET
                answer_revision = EXCLUDED.answer_revision,
                status = CASE
                    WHEN current_eval.answer_revision <> EXCLUDED.answer_revision
                      OR current_eval.status = 'failed' THEN 'pending'
                    ELSE current_eval.status
                END,
                result = CASE
                    WHEN current_eval.answer_revision <> EXCLUDED.answer_revision THEN NULL
                    ELSE current_eval.result
                END,
                error = CASE
                    WHEN current_eval.answer_revision <> EXCLUDED.answer_revision
                      OR current_eval.status = 'failed' THEN NULL
                    ELSE current_eval.error
                END,
                started_at = CASE
                    WHEN current_eval.answer_revision <> EXCLUDED.answer_revision
                      OR current_eval.status = 'failed' THEN NULL
                    ELSE current_eval.started_at
                END,
                completed_at = CASE
                    WHEN current_eval.answer_revision <> EXCLUDED.answer_revision THEN NULL
                    ELSE current_eval.completed_at
                END,
                updated_at = now()
            RETURNING * INTO v_eval;
            RETURN to_jsonb(v_eval);

        WHEN 'get' THEN
            SELECT e.* INTO v_eval
            FROM private.exam_attempt_evaluations e
            JOIN private.exam_attempts a ON a.id = e.attempt_id
            WHERE e.attempt_id = v_attempt_id
              AND a.user_id = v_user_id
              AND a.attempt_type = 'exam';
            RETURN CASE WHEN FOUND THEN to_jsonb(v_eval) ELSE NULL END;

        WHEN 'list' THEN
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'attempt_id', e.attempt_id,
                'answer_revision', e.answer_revision,
                'status', e.status,
                'model', e.model,
                'attempts', e.attempts,
                'error', e.error,
                'updated_at', e.updated_at,
                'total_awarded_marks', e.result->>'totalAwardedMarks',
                'total_possible_marks', e.result->>'totalPossibleMarks'
            ) ORDER BY e.updated_at DESC), '[]'::jsonb)
            INTO v_result
            FROM private.exam_attempt_evaluations e
            JOIN private.exam_attempts a ON a.id = e.attempt_id
            WHERE a.user_id = v_user_id
              AND a.attempt_type = 'exam'
              AND jsonb_typeof(p_payload->'attempt_ids') = 'array'
              AND e.attempt_id IN (
                  SELECT value::uuid FROM jsonb_array_elements_text(p_payload->'attempt_ids')
              );
            RETURN v_result;

        WHEN 'claim' THEN
            UPDATE private.exam_attempt_evaluations e
            SET status = 'evaluating',
                attempts = e.attempts + 1,
                started_at = now(),
                completed_at = NULL,
                error = NULL,
                updated_at = now()
            FROM private.exam_attempts a
            WHERE e.attempt_id = v_attempt_id
              AND e.answer_revision = v_revision
              AND a.id = e.attempt_id
              AND a.user_id = v_user_id
              AND a.attempt_type = 'exam'
              AND a.answer_revision = v_revision
              AND a.status IN ('submitted', 'auto_submitted')
              AND (
                  e.status IN ('pending', 'failed')
                  OR (e.status = 'evaluating' AND e.started_at < now() - interval '3 minutes')
              )
            RETURNING e.* INTO v_eval;

            IF FOUND THEN RETURN to_jsonb(v_eval); END IF;
            SELECT e.* INTO v_eval
            FROM private.exam_attempt_evaluations e
            JOIN private.exam_attempts a ON a.id = e.attempt_id
            WHERE e.attempt_id = v_attempt_id AND a.user_id = v_user_id;
            RETURN CASE WHEN FOUND THEN to_jsonb(v_eval) ELSE NULL END;

        WHEN 'complete' THEN
            UPDATE private.exam_attempt_evaluations e
            SET status = 'completed',
                result = p_payload->'result',
                error = NULL,
                completed_at = now(),
                updated_at = now()
            FROM private.exam_attempts a
            WHERE e.attempt_id = v_attempt_id
              AND e.answer_revision = v_revision
              AND e.status = 'evaluating'
              AND a.id = e.attempt_id
              AND a.user_id = v_user_id
              AND a.answer_revision = v_revision
              AND a.status IN ('submitted', 'auto_submitted')
              AND jsonb_typeof(p_payload->'result') = 'object'
            RETURNING e.* INTO v_eval;
            RETURN CASE WHEN FOUND THEN to_jsonb(v_eval) ELSE NULL END;

        WHEN 'fail' THEN
            UPDATE private.exam_attempt_evaluations e
            SET status = 'failed',
                error = LEFT(COALESCE(NULLIF(p_payload->>'error', ''), 'Evaluation failed. Please retry.'), 500),
                completed_at = now(),
                updated_at = now()
            FROM private.exam_attempts a
            WHERE e.attempt_id = v_attempt_id
              AND e.answer_revision = v_revision
              AND e.status = 'evaluating'
              AND a.id = e.attempt_id
              AND a.user_id = v_user_id
            RETURNING e.* INTO v_eval;
            RETURN CASE WHEN FOUND THEN to_jsonb(v_eval) ELSE NULL END;

        ELSE
            RAISE EXCEPTION 'Unsupported evaluation operation';
    END CASE;
END;
$function$;

REVOKE ALL ON FUNCTION public.pm_private_exam_evaluation_data(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pm_private_exam_evaluation_data(text, jsonb) TO service_role;

COMMIT;
