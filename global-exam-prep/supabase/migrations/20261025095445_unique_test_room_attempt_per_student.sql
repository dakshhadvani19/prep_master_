-- Prevent duplicate attempts for one authenticated user in the same Test Room.
create unique index if not exists exam_attempts_room_user_unique
  on public.exam_attempts (room_code, user_id)
  where attempt_type = 'test_room' and room_code is not null;
