-- ==========================================================================
-- Signup OTP: challenge storage + verification, in Postgres (was Firestore)
-- ==========================================================================
--
-- WHY THIS EXISTS
--   The emailed 6-digit code that gates signup used to live in the Firestore
--   `otp_tokens` collection. That made the auth-critical path depend on a second
--   backend which the browser had to reach directly — and a build without the
--   VITE_FIREBASE_* values could never complete a signup. Supabase is already the
--   identity store, so the challenge now lives here, and ONLY the serverless API
--   touches it: the browser never reads or writes this table.
--
-- SECURITY MODEL
--   * No client access at all: RLS is enabled with ZERO policies and every grant
--     to anon/authenticated is revoked. The only way in is via the service_role
--     key, which lives in Vercel env vars and never in the bundle. (RLS is
--     deliberately not `FORCE`d, because the SECURITY DEFINER functions below run
--     as the table owner.)
--   * No plaintext OTP in the database: `otp_hash` holds
--     HMAC-SHA256(OTP_PEPPER, email || ':' || code) as computed by the API. A
--     pepper (an env secret, not a DB column) is what makes the 10^6 code space
--     unbrute-forceable offline if a backup ever leaks.
--   * Single live challenge per address: `email` is the primary key, so a resend
--     supersedes the previous code instead of leaving two valid ones.
--   * Bounded attempts: 3 by default, enforced in the same statement that
--     compares the digest, so two concurrent guesses cannot both slip past.
--   * Resend cooldown (60 s) is enforced here, not in the browser, so it survives
--     a refresh, another tab, or another serverless instance.
--   * Single use: the row is deleted by the same function that accepts the code,
--     so a code cannot be replayed against signUp.
--
-- APPLY:  Supabase dashboard -> SQL Editor -> paste -> Run (idempotent).
--         or: npx supabase db push   (same file under supabase/migrations)
--
-- The nonce column is kept for operations, not security: the API logs
-- `nonce=<uuid>` so a reported "I never got the code" can be tied to exactly one
-- issuance without putting the address or the digest in a log line.

begin;

create table if not exists public.auth_otp (
    email        text         not null primary key,
    otp_hash     text         not null,
    nonce        uuid         not null default gen_random_uuid(),
    attempts     smallint     not null default 0,
    created_at   timestamptz  not null default now(),
    expires_at   timestamptz  not null,

    -- Normalised, shaped like a real address, and short enough for
    -- students.email varchar(320). The PK is on this column, so normalisation is
    -- also what makes "one live challenge per address" true.
    constraint auth_otp_email_normalised
        check (
            email = lower(btrim(email))
            and char_length(email) between 3 and 320
            and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
        ),

    -- A HMAC-SHA256 digest, hex. Anything else is a client bug or an attack.
    constraint auth_otp_hash_shape        check (otp_hash ~ '^[0-9a-f]{64}$'),
    constraint auth_otp_attempts_range     check (attempts between 0 and 10),
    -- A challenge must expire in the future and not live absurdly long.
    constraint auth_otp_ttl_bounds
        check (
            expires_at > created_at
            and extract(epoch from (expires_at - created_at)) between 60 and 1800
        )
);

comment on table public.auth_otp is
    'Short-lived signup OTP challenges. Written only by api/send-otp and '
    'api/verify-otp (service_role). Never readable from the browser.';
comment on column public.auth_otp.otp_hash is
    'HMAC-SHA256(OTP_PEPPER, email || '':'': || code), hex. The code itself is '
    'never stored.';
comment on column public.auth_otp.nonce is
    'Rotates on every issuance. Correlates one issuance across the API log and '
    'the SMTP message id; not a secret and not an auth factor.';

-- Pruning expired rows is a full scan without this; the table is small but the
-- cleanup runs on a schedule and should cost nothing.
create index if not exists auth_otp_expires_at_idx on public.auth_otp (expires_at);

alter table public.auth_otp enable row level security;
revoke all on table public.auth_otp from anon, authenticated;
grant select, insert, update, delete on table public.auth_otp to service_role;

-- ─── issue / supersede ───────────────────────────────────────────────────────
-- One statement does the cooldown check and the write, so two simultaneous
-- "send code" clicks cannot both install a challenge.
create or replace function public.auth_otp_issue(
    p_email             text,
    p_otp_hash          text,
    p_ttl_seconds       integer default 600,
    p_cooldown_seconds  integer default 60
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_now    timestamptz := now();
    v_email  text        := lower(btrim(coalesce(p_email, '')));
    v_rows   integer;
    v_seen   public.auth_otp%rowtype;
    v_wait   integer;
begin
    if v_email = '' or p_otp_hash is null or p_otp_hash !~ '^[0-9a-f]{64}$' then
        return jsonb_build_object('ok', false, 'reason', 'invalid_input');
    end if;
    -- 15 minutes is the ceiling the CHECK allows; 60 the shortest usable code.
    if coalesce(p_ttl_seconds, 0) not between 60 and 1800 then
        return jsonb_build_object('ok', false, 'reason', 'invalid_ttl');
    end if;
    if coalesce(p_cooldown_seconds, 0) not between 0 and 600 then
        return jsonb_build_object('ok', false, 'reason', 'invalid_cooldown');
    end if;

    insert into public.auth_otp as o
        (email, otp_hash, nonce, attempts, created_at, expires_at)
    values
        (v_email, p_otp_hash, gen_random_uuid(), 0, v_now,
         v_now + make_interval(secs => p_ttl_seconds))
    on conflict (email) do update
        set otp_hash   = excluded.otp_hash,
            nonce      = excluded.nonce,
            attempts   = 0,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at
      where o.created_at <= excluded.created_at - make_interval(secs => p_cooldown_seconds)
    returning 1 into v_rows;

    if coalesce(v_rows, 0) > 0 then
        return jsonb_build_object(
            'ok',                   true,
            'nonce',                (select nonce     from public.auth_otp where email = v_email),
            'expires_at',           (select expires_at from public.auth_otp where email = v_email),
            'ttl_seconds',          p_ttl_seconds,
            'resend_after_seconds', p_cooldown_seconds
        );
    end if;

    -- Refused by the cooldown. Report how long to wait, using the same clock the
    -- row was written with (not the caller's), so the UI countdown cannot lie.
    select * into v_seen from public.auth_otp where email = v_email;
    if not found then
        -- A verify/rollback deleted it between the two statements: retry is fine.
        return jsonb_build_object('ok', false, 'reason', 'retry', 'retry_after_seconds', 0);
    end if;

    v_wait := greatest(0, ceil(
        extract(epoch from (
            v_seen.created_at + make_interval(secs => p_cooldown_seconds) - v_now
        ))
    )::int);

    return jsonb_build_object(
        'ok',                 false,
        'reason',             'cooldown',
        'retry_after_seconds', v_wait,
        'expires_at',         v_seen.expires_at
    );
end;
$$;

-- ─── verify (and burn) ───────────────────────────────────────────────────────
-- The read locks the row, so `attempts` cannot be raced: N guesses in flight all
-- serialise here and the ceiling still holds.
create or replace function public.auth_otp_verify(
    p_email         text,
    p_otp_hash      text,
    p_max_attempts  integer default 3
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_email     text := lower(btrim(coalesce(p_email, '')));
    v_seen      public.auth_otp%rowtype;
    v_left      integer;
begin
    if v_email = '' or p_otp_hash is null or p_otp_hash !~ '^[0-9a-f]{64}$' then
        return jsonb_build_object('ok', false, 'reason', 'invalid_input');
    end if;

    select * into v_seen from public.auth_otp where email = v_email for update;

    if not found then
        -- Deliberately the same shape as a wrong code, so this endpoint is not an
        -- "does this address have a pending signup?" oracle.
        return jsonb_build_object('ok', false, 'reason', 'invalid', 'remaining', 0);
    end if;

    if v_seen.expires_at <= now() then
        delete from public.auth_otp where email = v_email;
        return jsonb_build_object('ok', false, 'reason', 'expired');
    end if;

    if v_seen.attempts >= coalesce(p_max_attempts, 3) then
        delete from public.auth_otp where email = v_email;
        return jsonb_build_object('ok', false, 'reason', 'locked', 'remaining', 0);
    end if;

    if v_seen.otp_hash is distinct from p_otp_hash then
        v_left := coalesce(p_max_attempts, 3) - (v_seen.attempts + 1);
        if v_left <= 0 then
            delete from public.auth_otp where email = v_email;
            return jsonb_build_object('ok', false, 'reason', 'locked', 'remaining', 0);
        end if;
        update public.auth_otp
            set attempts = v_seen.attempts + 1
          where email = v_email;
        return jsonb_build_object('ok', false, 'reason', 'invalid', 'remaining', v_left);
    end if;

    -- Single use: burn first, then report success. A crash between the two still
    -- cannot let the code be reused.
    delete from public.auth_otp where email = v_email;

    return jsonb_build_object(
        'ok',          true,
        'verified_at', now(),
        'email',       v_email
    );
end;
$$;

-- ─── rollback / cancel ───────────────────────────────────────────────────────
-- If Gmail rejects the message the challenge must not linger: the student would
-- otherwise wait out a 10-minute cooldown for an email that never arrived.
create or replace function public.auth_otp_discard(p_email text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
    with d as (
        delete from public.auth_otp
         where email = lower(btrim(coalesce(p_email, '')))
        returning 1
    )
    select jsonb_build_object('ok', true, 'discarded', exists (select 1 from d))
$$;

-- Housekeeping. Run from pg_cron (or the daily Operations job) if the table ever
-- grows; in normal use a row lives at most 10 minutes.
create or replace function public.auth_otp_prune()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
    with d as (
        delete from public.auth_otp where expires_at <= now() returning 1
    )
    select jsonb_build_object('ok', true, 'deleted', count(*)) from d
$$;

revoke all on function public.auth_otp_issue(text, text, integer, integer)  from public, anon, authenticated;
revoke all on function public.auth_otp_verify(text, text, integer)          from public, anon, authenticated;
revoke all on function public.auth_otp_discard(text)                       from public, anon, authenticated;
revoke all on function public.auth_otp_prune()                             from public, anon, authenticated;

grant execute on function public.auth_otp_issue(text, text, integer, integer)  to service_role;
grant execute on function public.auth_otp_verify(text, text, integer)          to service_role;
grant execute on function public.auth_otp_discard(text)                       to service_role;
grant execute on function public.auth_otp_prune()                             to service_role;

-- PostgREST needs an explicit reload after function/grant changes when the
-- project runs with a statement cache; harmless if it does not.
notify pgrst, 'reload schema';

commit;

-- ─── Smoke test (run manually if you want proof in the SQL editor) ──────────
-- select public.auth_otp_issue('Raja@Example.com ', '0'||repeat('a',63)) -> ok:true
-- select public.auth_otp_issue('raja@example.com',  '0'||repeat('a',63)) -> cooldown, retry_after_seconds ~ 60
-- select public.auth_otp_verify('raja@example.com',  '0'||repeat('a',63)) -> ok:true (single use, row gone)
-- select public.auth_otp_verify('raja@example.com',  '0'||repeat('a',63)) -> invalid, remaining 0
-- select count(*) from public.auth_otp -> 0
