BEGIN;

-- Keep operational attempt/answer-key/OTP data outside the core public schema.
ALTER TABLE public.exam_attempts SET SCHEMA private;
ALTER TABLE public.exam_attempt_keys SET SCHEMA private;
ALTER TABLE public.auth_otp SET SCHEMA private;

-- The grade table is deliberately retired only when empty; the attempt row already
-- stores score/total marks and the leaderboard projection stores verified ranking data.
DO $$
BEGIN
  IF to_regclass('public.exam_grades') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.exam_grades LIMIT 1) THEN
    RAISE EXCEPTION 'public.exam_grades is not empty; migrate its rows before removal';
  END IF;
END;
$$;
DROP TABLE IF EXISTS public.exam_grades;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
REVOKE ALL ON TABLE private.exam_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.exam_attempt_keys FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.auth_otp FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.leaderboard_attempt_results FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.exam_attempts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.exam_attempt_keys TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.auth_otp TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.leaderboard_attempt_results TO service_role;

CREATE OR REPLACE FUNCTION private.validate_leaderboard_attempt_result()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
  v_attempt record;
BEGIN
  SELECT a.user_id, a.score, a.total_marks, a.status, a.attempt_type,
         a.difficulty, a.submitted_at
    INTO v_attempt
    FROM private.exam_attempts AS a
   WHERE a.id = NEW.source_attempt_id
   FOR KEY SHARE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Source exam attempt does not exist'; END IF;
  IF v_attempt.user_id IS DISTINCT FROM NEW.student_auth_uid THEN
    RAISE EXCEPTION 'Leaderboard student does not match source attempt owner';
  END IF;
  IF v_attempt.status NOT IN ('submitted', 'auto_submitted')
     OR v_attempt.submitted_at IS NULL OR v_attempt.score IS NULL THEN
    RAISE EXCEPTION 'Only completed, scored attempts can enter the leaderboard';
  END IF;
  IF v_attempt.attempt_type IS DISTINCT FROM NEW.attempt_type
     OR v_attempt.difficulty IS DISTINCT FROM NEW.difficulty THEN
    RAISE EXCEPTION 'Leaderboard attempt metadata does not match source attempt';
  END IF;
  IF v_attempt.score::numeric IS DISTINCT FROM NEW.score
     OR v_attempt.total_marks::numeric IS DISTINCT FROM NEW.max_score THEN
    RAISE EXCEPTION 'Leaderboard score must match the finalized source attempt';
  END IF;
  NEW.completed_at := v_attempt.submitted_at;
  RETURN NEW;
END;
$function$;

-- Server-only RPC gateway; browsers cannot call this because EXECUTE is limited to service_role.
CREATE OR REPLACE FUNCTION public.pm_private_exam_data(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_result jsonb;
  v_row private.exam_attempts%ROWTYPE;
  v_patch jsonb;
  v_bad_key text;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload must be a JSON object';
  END IF;

  CASE p_action
    WHEN 'create_attempt' THEN
      INSERT INTO private.exam_attempts (
        user_id, subject_code, subject_name, exam_type, difficulty, questions,
        total_marks, time_minutes, answers, score, status, attempt_type, room_code,
        room_role, participant_name, correct_count, incorrect_count, attempted_count,
        unattempted_count, end_reason, started_at, submitted_at, updated_at, answer_revision
      ) VALUES (
        (p_payload->>'user_id')::uuid,
        p_payload->>'subject_code',
        COALESCE(NULLIF(p_payload->>'subject_name',''), 'Unknown subject'),
        COALESCE(NULLIF(p_payload->>'exam_type',''), 'MCQ'),
        COALESCE(NULLIF(p_payload->>'difficulty',''), 'medium'),
        COALESCE(p_payload->'questions', '[]'::jsonb),
        COALESCE(NULLIF(p_payload->>'total_marks','')::integer, 30),
        COALESCE(NULLIF(p_payload->>'time_minutes','')::integer, 0),
        COALESCE(p_payload->'answers', '{}'::jsonb),
        NULLIF(p_payload->>'score','')::integer,
        COALESCE(NULLIF(p_payload->>'status',''), 'in_progress'),
        COALESCE(NULLIF(p_payload->>'attempt_type',''), 'exam'),
        p_payload->>'room_code', p_payload->>'room_role', p_payload->>'participant_name',
        NULLIF(p_payload->>'correct_count','')::integer,
        NULLIF(p_payload->>'incorrect_count','')::integer,
        NULLIF(p_payload->>'attempted_count','')::integer,
        NULLIF(p_payload->>'unattempted_count','')::integer,
        p_payload->>'end_reason',
        COALESCE(NULLIF(p_payload->>'started_at','')::timestamptz, now()),
        NULLIF(p_payload->>'submitted_at','')::timestamptz,
        COALESCE(NULLIF(p_payload->>'updated_at','')::timestamptz, now()),
        COALESCE(NULLIF(p_payload->>'answer_revision','')::bigint, 0)
      ) RETURNING * INTO v_row;

      IF p_payload ? 'answer_key' AND p_payload->'answer_key' <> 'null'::jsonb THEN
        INSERT INTO private.exam_attempt_keys (attempt_id, answer_key)
        VALUES (v_row.id, p_payload->'answer_key')
        ON CONFLICT (attempt_id) DO UPDATE SET answer_key = EXCLUDED.answer_key;
      END IF;
      RETURN to_jsonb(v_row);

    WHEN 'get_attempt' THEN
      SELECT to_jsonb(a) INTO v_result
      FROM private.exam_attempts AS a
      WHERE (NOT (p_payload ? 'id') OR a.id = (p_payload->>'id')::uuid)
        AND (NOT (p_payload ? 'user_id') OR a.user_id = (p_payload->>'user_id')::uuid)
        AND (NOT (p_payload ? 'room_code') OR a.room_code = p_payload->>'room_code')
        AND (NOT (p_payload ? 'attempt_type') OR a.attempt_type = p_payload->>'attempt_type')
        AND (NOT (p_payload ? 'room_role') OR a.room_role = p_payload->>'room_role')
      LIMIT 1;
      RETURN COALESCE(v_result, 'null'::jsonb);

    WHEN 'list_attempts' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb) INTO v_result
      FROM (
        SELECT a.*
        FROM private.exam_attempts AS a
        WHERE (NOT (p_payload ? 'user_id') OR a.user_id = (p_payload->>'user_id')::uuid)
          AND (NOT (p_payload ? 'room_code') OR a.room_code = p_payload->>'room_code')
          AND (NOT (p_payload ? 'attempt_type') OR a.attempt_type = p_payload->>'attempt_type')
          AND (NOT (p_payload ? 'room_role') OR a.room_role = p_payload->>'room_role')
          AND (NOT (p_payload ? 'statuses') OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(p_payload->'statuses') AS s(value)
            WHERE s.value = a.status
          ))
        ORDER BY
          CASE WHEN p_payload->>'order' = 'submitted_at_asc' THEN a.submitted_at END ASC NULLS LAST,
          CASE WHEN p_payload->>'order' = 'started_at_asc' THEN a.started_at END ASC NULLS LAST,
          a.started_at DESC
        LIMIT LEAST(GREATEST(COALESCE(NULLIF(p_payload->>'limit','')::integer, 100), 1), 100)
      ) AS q;
      RETURN v_result;

    WHEN 'update_attempt' THEN
      v_patch := COALESCE(p_payload->'patch', '{}'::jsonb);
      IF jsonb_typeof(v_patch) <> 'object' THEN RAISE EXCEPTION 'Patch must be a JSON object'; END IF;
      SELECT k.key INTO v_bad_key
      FROM jsonb_object_keys(v_patch) AS k(key)
      WHERE k.key <> ALL (ARRAY[
        'subject_code','subject_name','exam_type','difficulty','questions','total_marks',
        'time_minutes','answers','score','status','room_code','room_role','participant_name',
        'correct_count','incorrect_count','attempted_count','unattempted_count','end_reason',
        'started_at','submitted_at','updated_at','answer_revision'
      ])
      LIMIT 1;
      IF v_bad_key IS NOT NULL THEN RAISE EXCEPTION 'Field is not allowed to be updated: %', v_bad_key; END IF;

      WITH updated AS (
        UPDATE private.exam_attempts AS a
        SET
          subject_code = CASE WHEN v_patch ? 'subject_code' THEN v_patch->>'subject_code' ELSE a.subject_code END,
          subject_name = CASE WHEN v_patch ? 'subject_name' THEN v_patch->>'subject_name' ELSE a.subject_name END,
          exam_type = CASE WHEN v_patch ? 'exam_type' THEN v_patch->>'exam_type' ELSE a.exam_type END,
          difficulty = CASE WHEN v_patch ? 'difficulty' THEN v_patch->>'difficulty' ELSE a.difficulty END,
          questions = CASE WHEN v_patch ? 'questions' THEN v_patch->'questions' ELSE a.questions END,
          total_marks = CASE WHEN v_patch ? 'total_marks' THEN (v_patch->>'total_marks')::integer ELSE a.total_marks END,
          time_minutes = CASE WHEN v_patch ? 'time_minutes' THEN (v_patch->>'time_minutes')::integer ELSE a.time_minutes END,
          answers = CASE WHEN v_patch ? 'answers' THEN v_patch->'answers' ELSE a.answers END,
          score = CASE WHEN v_patch ? 'score' THEN NULLIF(v_patch->>'score','')::integer ELSE a.score END,
          status = CASE WHEN v_patch ? 'status' THEN v_patch->>'status' ELSE a.status END,
          room_code = CASE WHEN v_patch ? 'room_code' THEN v_patch->>'room_code' ELSE a.room_code END,
          room_role = CASE WHEN v_patch ? 'room_role' THEN v_patch->>'room_role' ELSE a.room_role END,
          participant_name = CASE WHEN v_patch ? 'participant_name' THEN v_patch->>'participant_name' ELSE a.participant_name END,
          correct_count = CASE WHEN v_patch ? 'correct_count' THEN NULLIF(v_patch->>'correct_count','')::integer ELSE a.correct_count END,
          incorrect_count = CASE WHEN v_patch ? 'incorrect_count' THEN NULLIF(v_patch->>'incorrect_count','')::integer ELSE a.incorrect_count END,
          attempted_count = CASE WHEN v_patch ? 'attempted_count' THEN NULLIF(v_patch->>'attempted_count','')::integer ELSE a.attempted_count END,
          unattempted_count = CASE WHEN v_patch ? 'unattempted_count' THEN NULLIF(v_patch->>'unattempted_count','')::integer ELSE a.unattempted_count END,
          end_reason = CASE WHEN v_patch ? 'end_reason' THEN v_patch->>'end_reason' ELSE a.end_reason END,
          started_at = CASE WHEN v_patch ? 'started_at' THEN NULLIF(v_patch->>'started_at','')::timestamptz ELSE a.started_at END,
          submitted_at = CASE WHEN v_patch ? 'submitted_at' THEN NULLIF(v_patch->>'submitted_at','')::timestamptz ELSE a.submitted_at END,
          updated_at = CASE WHEN v_patch ? 'updated_at' THEN NULLIF(v_patch->>'updated_at','')::timestamptz ELSE a.updated_at END,
          answer_revision = CASE WHEN v_patch ? 'answer_revision' THEN (v_patch->>'answer_revision')::bigint ELSE a.answer_revision END
        WHERE (NOT (p_payload ? 'id') OR a.id = (p_payload->>'id')::uuid)
          AND (NOT (p_payload ? 'user_id') OR a.user_id = (p_payload->>'user_id')::uuid)
          AND (NOT (p_payload ? 'room_code') OR a.room_code = p_payload->>'room_code')
          AND (NOT (p_payload ? 'attempt_type') OR a.attempt_type = p_payload->>'attempt_type')
          AND (NOT (p_payload ? 'room_role') OR a.room_role = p_payload->>'room_role')
          AND (NOT (p_payload ? 'statuses') OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(p_payload->'statuses') AS s(value)
            WHERE s.value = a.status
          ))
          AND (NOT (p_payload ? 'before_revision') OR a.answer_revision < (p_payload->>'before_revision')::bigint)
        RETURNING *
      )
      SELECT CASE
        WHEN p_payload ? 'id' THEN COALESCE((SELECT to_jsonb(u) FROM updated AS u LIMIT 1), 'null'::jsonb)
        ELSE COALESCE((SELECT jsonb_agg(to_jsonb(u)) FROM updated AS u), '[]'::jsonb)
      END INTO v_result;
      RETURN v_result;

    WHEN 'set_answer_key' THEN
      INSERT INTO private.exam_attempt_keys (attempt_id, answer_key)
      VALUES ((p_payload->>'attempt_id')::uuid, p_payload->'answer_key')
      ON CONFLICT (attempt_id) DO UPDATE SET answer_key = EXCLUDED.answer_key;
      RETURN jsonb_build_object('ok', true);

    WHEN 'get_answer_key' THEN
      SELECT jsonb_build_object('answer_key', k.answer_key) INTO v_result
      FROM private.exam_attempt_keys AS k
      WHERE k.attempt_id = (p_payload->>'attempt_id')::uuid;
      RETURN COALESCE(v_result, 'null'::jsonb);

    ELSE
      RAISE EXCEPTION 'Unsupported operation';
  END CASE;
END;
$function$;

REVOKE ALL ON FUNCTION public.pm_private_exam_data(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pm_private_exam_data(text, jsonb) TO service_role;

-- Keep the existing server-only OTP RPC names for API compatibility but store challenges privately.
CREATE OR REPLACE FUNCTION public.auth_otp_issue(
    p_email text, p_otp_hash text, p_ttl_seconds integer DEFAULT 600,
    p_cooldown_seconds integer DEFAULT 60
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_now timestamptz := now();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_rows integer;
  v_seen private.auth_otp%ROWTYPE;
  v_wait integer;
BEGIN
  IF v_email = '' OR p_otp_hash IS NULL OR p_otp_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;
  IF coalesce(p_ttl_seconds, 0) NOT BETWEEN 60 AND 1800 THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_ttl'); END IF;
  IF coalesce(p_cooldown_seconds, 0) NOT BETWEEN 0 AND 600 THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_cooldown'); END IF;

  INSERT INTO private.auth_otp AS o (email, otp_hash, nonce, attempts, created_at, expires_at)
  VALUES (v_email, p_otp_hash, gen_random_uuid(), 0, v_now, v_now + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (email) DO UPDATE
    SET otp_hash = EXCLUDED.otp_hash, nonce = EXCLUDED.nonce, attempts = 0,
        created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at
    WHERE o.created_at <= EXCLUDED.created_at - make_interval(secs => p_cooldown_seconds)
  RETURNING 1 INTO v_rows;

  IF coalesce(v_rows, 0) > 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'nonce', (SELECT nonce FROM private.auth_otp WHERE email = v_email),
      'expires_at', (SELECT expires_at FROM private.auth_otp WHERE email = v_email),
      'ttl_seconds', p_ttl_seconds,
      'resend_after_seconds', p_cooldown_seconds
    );
  END IF;
  SELECT * INTO v_seen FROM private.auth_otp WHERE email = v_email;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'retry', 'retry_after_seconds', 0); END IF;
  v_wait := greatest(0, ceil(extract(epoch FROM (v_seen.created_at + make_interval(secs => p_cooldown_seconds) - v_now)))::int);
  RETURN jsonb_build_object('ok', false, 'reason', 'cooldown', 'retry_after_seconds', v_wait, 'expires_at', v_seen.expires_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.auth_otp_verify(p_email text, p_otp_hash text, p_max_attempts integer DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_seen private.auth_otp%ROWTYPE;
  v_left integer;
BEGIN
  IF v_email = '' OR p_otp_hash IS NULL OR p_otp_hash !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input'); END IF;
  SELECT * INTO v_seen FROM private.auth_otp WHERE email = v_email FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'remaining', 0); END IF;
  IF v_seen.expires_at <= now() THEN
    DELETE FROM private.auth_otp WHERE email = v_email;
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  IF v_seen.attempts >= coalesce(p_max_attempts, 3) THEN
    DELETE FROM private.auth_otp WHERE email = v_email;
    RETURN jsonb_build_object('ok', false, 'reason', 'locked', 'remaining', 0);
  END IF;
  IF v_seen.otp_hash IS DISTINCT FROM p_otp_hash THEN
    v_left := coalesce(p_max_attempts, 3) - (v_seen.attempts + 1);
    IF v_left <= 0 THEN
      DELETE FROM private.auth_otp WHERE email = v_email;
      RETURN jsonb_build_object('ok', false, 'reason', 'locked', 'remaining', 0);
    END IF;
    UPDATE private.auth_otp SET attempts = v_seen.attempts + 1 WHERE email = v_email;
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'remaining', v_left);
  END IF;
  DELETE FROM private.auth_otp WHERE email = v_email;
  RETURN jsonb_build_object('ok', true, 'verified_at', now(), 'email', v_email);
END;
$function$;

CREATE OR REPLACE FUNCTION public.auth_otp_discard(p_email text)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  WITH d AS (DELETE FROM private.auth_otp WHERE email = lower(btrim(coalesce(p_email, ''))) RETURNING 1)
  SELECT jsonb_build_object('ok', true, 'discarded', EXISTS (SELECT 1 FROM d));
$function$;

CREATE OR REPLACE FUNCTION public.auth_otp_prune()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  WITH d AS (DELETE FROM private.auth_otp WHERE expires_at <= now() RETURNING 1)
  SELECT jsonb_build_object('ok', true, 'deleted', count(*)) FROM d;
$function$;

REVOKE ALL ON FUNCTION public.auth_otp_issue(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auth_otp_verify(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auth_otp_discard(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auth_otp_prune() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_otp_issue(text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_otp_verify(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_otp_discard(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_otp_prune() TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
