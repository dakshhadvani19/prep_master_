BEGIN;

-- The exact 46 public catalog rows were archived in
-- temp_removed_subjects/project_deliverable_subjects_removed_2026-10-30.csv
-- before this migration was applied.
DO $project_catalog_removal$
DECLARE
  v_subject_ids bigint[] := ARRAY[22000423160601, 37013168081301, 32002132035401, 5001920170301, 5001920180101, 1001920170301, 1001920180101, 8000135060901, 8000135071501, 8000135080701, 10001920170301, 10001920080101, 9000135071501, 9000135080701, 7001320080101, 43101625080601, 20000422061501, 21000422061501, 27000422061501, 26000422061501, 18000523330501, 18000523350601, 18000523350701, 18000523360701, 18000528070201, 18000528080101, 46000938250401, 46000938260301, 48000939250501, 48000939260501, 44000935150501, 44000935160201, 47000955250701, 49009320050401, 49009320060201, 45009135150501, 45009135160501, 39131317030401, 38013133030401, 40131318030401, 34002325155402, 34002325155401, 35002132055201, 19005133020401, 19005133030401, 19005133040101]::bigint[];
  v_expected_count integer := 46;
  v_actual_count integer;
  v_attempt_count bigint;
  v_result_count bigint;
  v_snapshot_count bigint;
  v_deleted_count integer;
BEGIN
  SELECT count(*) INTO v_actual_count
  FROM public."Subjects"
  WHERE "SubjectId" = ANY(v_subject_ids);

  IF v_actual_count <> v_expected_count THEN
    RAISE EXCEPTION 'Project catalog removal aborted: expected % exact subject rows, found %.',
      v_expected_count, v_actual_count;
  END IF;

  SELECT count(*) INTO v_attempt_count
  FROM private.exam_attempts
  WHERE subject_id = ANY(v_subject_ids);

  SELECT count(*) INTO v_result_count
  FROM private.leaderboard_attempt_results
  WHERE subject_id = ANY(v_subject_ids);

  SELECT count(*) INTO v_snapshot_count
  FROM public."Leaderboards"
  WHERE "SubjectId" = ANY(v_subject_ids);

  IF v_attempt_count <> 0 OR v_result_count <> 0 OR v_snapshot_count <> 0 THEN
    RAISE EXCEPTION 'Project catalog removal aborted: dependent exam attempts %, leaderboard results %, published snapshots %.',
      v_attempt_count, v_result_count, v_snapshot_count;
  END IF;

  DELETE FROM public."Subjects"
  WHERE "SubjectId" = ANY(v_subject_ids);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count <> v_expected_count THEN
    RAISE EXCEPTION 'Project catalog removal aborted: expected to delete %, deleted %.',
      v_expected_count, v_deleted_count;
  END IF;
END
$project_catalog_removal$;

COMMIT;
