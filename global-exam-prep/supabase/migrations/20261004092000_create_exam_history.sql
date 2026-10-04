create table if not exists public.exam_history (
  id bigint primary key,
  auth_uid uuid not null references auth.users(id) on delete cascade,
  date timestamptz not null default now(),
  subject_id text not null default 'unknown',
  exam_type text not null default 'unknown',
  difficulty text not null default 'medium',
  type text not null default 'objective',
  score integer,
  total_marks integer not null default 0,
  questions jsonb not null default '[]'::jsonb,
  user_answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists exam_history_auth_uid_date_idx
  on public.exam_history (auth_uid, date desc);

alter table public.exam_history enable row level security;

drop policy if exists "exam_history_select_own" on public.exam_history;
create policy "exam_history_select_own"
  on public.exam_history
  for select
  to authenticated
  using ((select auth.uid()) = auth_uid);

drop policy if exists "exam_history_insert_own" on public.exam_history;
create policy "exam_history_insert_own"
  on public.exam_history
  for insert
  to authenticated
  with check ((select auth.uid()) = auth_uid);

drop policy if exists "exam_history_update_own" on public.exam_history;
create policy "exam_history_update_own"
  on public.exam_history
  for update
  to authenticated
  using ((select auth.uid()) = auth_uid)
  with check ((select auth.uid()) = auth_uid);

drop policy if exists "exam_history_delete_own" on public.exam_history;
create policy "exam_history_delete_own"
  on public.exam_history
  for delete
  to authenticated
  using ((select auth.uid()) = auth_uid);

grant select, insert, update, delete on public.exam_history to authenticated;
