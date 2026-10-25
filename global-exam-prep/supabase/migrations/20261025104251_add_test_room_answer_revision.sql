-- Monotonic answer snapshots prevent out-of-order network requests
-- from overwriting a newer selection in the durable attempts table.
alter table public.exam_attempts
    add column if not exists answer_revision bigint not null default 0;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'exam_attempts_answer_revision_nonnegative'
          and conrelid = 'public.exam_attempts'::regclass
    ) then
        alter table public.exam_attempts
            add constraint exam_attempts_answer_revision_nonnegative
            check (answer_revision >= 0);
    end if;
end $$;
