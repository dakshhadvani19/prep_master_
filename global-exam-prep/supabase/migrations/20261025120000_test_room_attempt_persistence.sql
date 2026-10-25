-- Persistent MCQ/Test Room attempts. Room metadata itself remains temporary in Redis;
-- each authenticated participant's question snapshot, selected answers and final score
-- are durable in exam_attempts so a disconnect cannot erase their attempt.
create table if not exists public.exam_attempts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    subject_code text,
    subject_name text not null default 'Unknown subject',
    exam_type text not null default 'MCQ',
    difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
    questions jsonb not null default '[]'::jsonb,
    total_marks integer not null default 30 check (total_marks >= 0),
    time_minutes integer not null default 0 check (time_minutes >= 0),
    answers jsonb not null default '{}'::jsonb,
    score integer check (score is null or score >= 0),
    status text not null default 'in_progress'
      check (status in ('waiting', 'in_progress', 'submitted', 'auto_submitted', 'disconnected', 'timed_out', 'cancelled')),
    attempt_type text not null default 'exam' check (attempt_type in ('exam', 'test_room')),
    room_code text,
    room_role text check (room_role is null or room_role in ('host', 'participant')),
    participant_name text,
    correct_count integer check (correct_count is null or correct_count >= 0),
    incorrect_count integer check (incorrect_count is null or incorrect_count >= 0),
    attempted_count integer check (attempted_count is null or attempted_count >= 0),
    unattempted_count integer check (unattempted_count is null or unattempted_count >= 0),
    end_reason text,
    started_at timestamptz not null default now(),
    submitted_at timestamptz,
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists exam_attempts_user_started_idx
  on public.exam_attempts (user_id, started_at desc);
create index if not exists exam_attempts_room_code_idx
  on public.exam_attempts (room_code) where room_code is not null;
create unique index if not exists exam_attempts_room_user_unique
  on public.exam_attempts (room_code, user_id)
  where attempt_type = 'test_room' and room_code is not null;

alter table public.exam_attempts enable row level security;
grant select, insert, update on public.exam_attempts to authenticated;

drop policy if exists "Users can view their own exam attempts" on public.exam_attempts;
create policy "Users can view their own exam attempts"
  on public.exam_attempts for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own non-room exam attempts" on public.exam_attempts;
create policy "Users can create their own non-room exam attempts"
  on public.exam_attempts for insert to authenticated
  with check ((select auth.uid()) = user_id and attempt_type = 'exam');

drop policy if exists "Users can update their own non-room exam attempts" on public.exam_attempts;
create policy "Users can update their own non-room exam attempts"
  on public.exam_attempts for update to authenticated
  using ((select auth.uid()) = user_id and attempt_type = 'exam')
  with check ((select auth.uid()) = user_id and attempt_type = 'exam');

create table if not exists public.exam_grades (
    id uuid primary key default gen_random_uuid(),
    attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    score numeric not null check (score >= 0),
    total_marks numeric not null check (total_marks >= 0),
    percentage numeric check (percentage is null or (percentage >= 0 and percentage <= 100)),
    grade text,
    feedback text,
    created_at timestamptz not null default now()
);

create index if not exists exam_grades_user_created_idx
  on public.exam_grades (user_id, created_at desc);
create unique index if not exists exam_grades_attempt_unique
  on public.exam_grades (attempt_id);
alter table public.exam_grades enable row level security;
grant select, insert on public.exam_grades to authenticated;

drop policy if exists "Users can view their own exam grades" on public.exam_grades;
create policy "Users can view their own exam grades"
  on public.exam_grades for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create grades for their own non-room attempts" on public.exam_grades;
create policy "Users can create grades for their own non-room attempts"
  on public.exam_grades for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id and a.user_id = (select auth.uid()) and a.attempt_type = 'exam'
    )
  );

-- Correct answers are held in a server-only table. There is intentionally no policy
-- for anon/authenticated users; service_role is used exclusively by server APIs.
create table if not exists public.exam_attempt_keys (
    attempt_id uuid primary key references public.exam_attempts(id) on delete cascade,
    answer_key jsonb not null,
    created_at timestamptz not null default now()
);
alter table public.exam_attempt_keys enable row level security;
revoke all on table public.exam_attempt_keys from public, anon, authenticated;
grant all on table public.exam_attempt_keys to service_role;
drop policy if exists "Deny client access to private answer keys" on public.exam_attempt_keys;
create policy "Deny client access to private answer keys"
  on public.exam_attempt_keys for all to anon, authenticated
  using (false) with check (false);
