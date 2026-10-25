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
