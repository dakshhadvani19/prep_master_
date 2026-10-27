CREATE INDEX IF NOT EXISTS exam_attempts_core_test_id_idx
  ON private.exam_attempts (core_test_id);
CREATE INDEX IF NOT EXISTS exam_attempts_core_attempt_id_idx
  ON private.exam_attempts (core_attempt_id);
CREATE INDEX IF NOT EXISTS exam_attempts_core_room_id_idx
  ON private.exam_attempts (core_room_id);
