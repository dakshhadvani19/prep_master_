import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS = [
    '20261025095212_add_persistent_exam_attempts_and_grades.sql',
    '20261025095445_unique_test_room_attempt_per_student.sql',
    '20261025095507_keep_test_room_answer_keys_server_only.sql',
    '20261025104251_add_test_room_answer_revision.sql',
    '20261027102327_create_private_leaderboard_attempt_results.sql',
    '20261027103817_move_exam_support_to_private_and_remove_grades.sql',
].map((filename) => readFileSync(
    `${globalThis.process.cwd()}/supabase/migrations/${filename}`,
    'utf8',
));

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let db;

beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
        do $$ begin
            if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
            if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
            if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
        end $$;

        create schema auth;
        create table auth.users (id uuid primary key);
        create or replace function auth.uid() returns uuid language sql stable as $$
            select nullif(current_setting('test.uid', true), '')::uuid
        $$;
        grant usage on schema public to anon, authenticated, service_role;
        grant usage on schema auth to anon, authenticated, service_role;
        grant execute on function auth.uid() to anon, authenticated, service_role;
        insert into auth.users (id) values ('${USER_A}'), ('${USER_B}');

        -- Core catalogue fixture required by the private leaderboard FK.
        create table public."Subjects" ("SubjectId" bigint primary key);
        insert into public."Subjects" ("SubjectId") values (1001);

        -- The production OTP table is created by an earlier migration. Keep just
        -- the columns needed by the move migration and its private OTP functions.
        create table public.auth_otp (
            email text primary key,
            otp_hash text not null,
            nonce uuid not null default gen_random_uuid(),
            attempts smallint not null default 0,
            created_at timestamptz not null default now(),
            expires_at timestamptz not null
        );
        insert into public.auth_otp(email, otp_hash, created_at, expires_at)
        values ('held@example.com', repeat('a',64), now(), now() + interval '10 minutes');
    `);
    for (const migration of MIGRATIONS) await db.exec(migration);
}, 120000);

afterAll(async () => { await db?.close(); });

async function asRole(role, query) {
    await db.exec(`set role ${role}`);
    try {
        return await db.query(query);
    } finally {
        await db.exec('reset role');
    }
}

describe('Private exam-support schema migration', () => {
    it('moves support tables to private and removes the redundant, empty grade table', async () => {
        const result = await db.query(`
            select
              to_regclass('private.exam_attempts') is not null as attempts_private,
              to_regclass('public.exam_attempts') is null as attempts_removed_from_public,
              to_regclass('private.exam_attempt_keys') is not null as keys_private,
              to_regclass('public.exam_attempt_keys') is null as keys_removed_from_public,
              to_regclass('private.auth_otp') is not null as otp_private,
              to_regclass('public.auth_otp') is null as otp_removed_from_public,
              to_regclass('public.exam_grades') is null as grades_removed
        `);
        expect(result.rows[0]).toEqual({
            attempts_private: true,
            attempts_removed_from_public: true,
            keys_private: true,
            keys_removed_from_public: true,
            otp_private: true,
            otp_removed_from_public: true,
            grades_removed: true,
        });
    });

    it('preserves row-level security and blocks direct browser access to private storage', async () => {
        const rls = await db.query(`
            select c.relname, c.relrowsecurity
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'private'
              and c.relname in ('exam_attempts', 'exam_attempt_keys', 'auth_otp', 'leaderboard_attempt_results')
        `);
        expect(rls.rows).toHaveLength(4);
        expect(rls.rows.every((row) => row.relrowsecurity)).toBe(true);

        await expect(asRole('authenticated', 'select * from private.exam_attempts'))
            .rejects.toThrow(/permission denied/i);
        await expect(asRole('authenticated', 'select answer_key from private.exam_attempt_keys'))
            .rejects.toThrow(/permission denied/i);
    });

    it('retains attempt and answer-key records in the private tables and allows service-role reads', async () => {
        const inserted = await db.query(`
            insert into private.exam_attempts (user_id, subject_name, questions, attempt_type, status, room_code)
            values ('${USER_A}', 'Room A', '[]'::jsonb, 'test_room', 'in_progress', 'ROOMAAA111')
            returning id
        `);
        await db.query(`
            insert into private.exam_attempt_keys (attempt_id, answer_key)
            values ('${inserted.rows[0].id}', '[0,1,2]'::jsonb)
        `);
        const serverAttempts = await asRole('service_role', 'select id from private.exam_attempts');
        const serverKey = await asRole('service_role', 'select answer_key from private.exam_attempt_keys');
        expect(serverAttempts.rows).toHaveLength(1);
        expect(serverKey.rows[0].answer_key).toEqual([0, 1, 2]);
    });

    it('keeps the server-only RPC unavailable to authenticated clients', async () => {
        await expect(asRole('authenticated', `select public.pm_private_exam_data('list_attempts', '{}'::jsonb)`))
            .rejects.toThrow(/permission denied/i);
        const accessible = await asRole('service_role', `select public.pm_private_exam_data('list_attempts', '{"limit":1}'::jsonb) as result`);
        expect(Array.isArray(accessible.rows[0].result)).toBe(true);
    });

    it('prevents duplicate Test Room attempts for the same user and room code', async () => {
        await db.query(`
            insert into private.exam_attempts (user_id, subject_name, attempt_type, room_code)
            values ('${USER_A}', 'Room A', 'test_room', 'UNIQUE1111')
        `);
        await expect(db.query(`
            insert into private.exam_attempts (user_id, subject_name, attempt_type, room_code)
            values ('${USER_A}', 'Room A again', 'test_room', 'UNIQUE1111')
        `)).rejects.toThrow(/unique|duplicate/i);
    });

    it('prevents an out-of-order answer save from overwriting a newer durable snapshot', async () => {
        const inserted = await db.query(`
            insert into private.exam_attempts
                (user_id, subject_name, questions, answers, attempt_type, status, room_code, answer_revision)
            values
                ('${USER_A}', 'Revision test', '[]'::jsonb, '[null,null]'::jsonb, 'test_room', 'in_progress', 'REVISION1111', 0)
            returning id
        `);
        const id = inserted.rows[0].id;
        await db.query(`
            update private.exam_attempts
            set answers = '[2,3]'::jsonb, answer_revision = 2
            where id = '${id}' and status = 'in_progress' and answer_revision < 2
        `);
        await db.query(`
            update private.exam_attempts
            set answers = '[1,null]'::jsonb, answer_revision = 1
            where id = '${id}' and status = 'in_progress' and answer_revision < 1
        `);
        const saved = await db.query(
            'select answers, answer_revision from private.exam_attempts where id = $1', [id],
        );
        expect(saved.rows[0].answer_revision).toBe(2);
        expect(saved.rows[0].answers).toEqual([2, 3]);
    });

    it('prevents a second finalizer from overwriting an already-finalized result', async () => {
        const inserted = await db.query(`
            insert into private.exam_attempts
                (user_id, subject_name, questions, answers, attempt_type, status, room_code, score)
            values
                ('${USER_A}', 'Finalization race', '[]'::jsonb, '[1,2]'::jsonb, 'test_room', 'in_progress', 'FINALIZE1111', null)
            returning id
        `);
        const id = inserted.rows[0].id;
        const firstFinalizer = await db.query(`
            update private.exam_attempts
            set status = 'submitted', score = 2, submitted_at = now(), answers = '[1,2]'::jsonb
            where id = '${id}' and user_id = '${USER_A}'
              and attempt_type = 'test_room' and status = 'in_progress'
            returning id
        `);
        const delayedFinalizer = await db.query(`
            update private.exam_attempts
            set status = 'disconnected', score = 0, answers = '[null,null]'::jsonb
            where id = '${id}' and user_id = '${USER_A}'
              and attempt_type = 'test_room' and status = 'in_progress'
            returning id
        `);
        expect(firstFinalizer.rows).toHaveLength(1);
        expect(delayedFinalizer.rows).toHaveLength(0);
        const durable = await db.query('select status, score, answers from private.exam_attempts where id = $1', [id]);
        expect(durable.rows[0]).toEqual({ status: 'submitted', score: 2, answers: [1, 2] });
    });

    it('preserves OTP verification behavior while keeping the challenge data private', async () => {
        const issued = await db.query(
            `select public.auth_otp_issue('new@example.com', '0' || repeat('a',63), 600, 0) as result`,
        );
        expect(issued.rows[0].result.ok).toBe(true);
        const row = await db.query(`select otp_hash from private.auth_otp where email='new@example.com'`);
        expect(row.rows[0].otp_hash).toBe('0' + 'a'.repeat(63));
        const verified = await db.query(
            `select public.auth_otp_verify('new@example.com', '0' || repeat('a',63), 3) as result`,
        );
        expect(verified.rows[0].result.ok).toBe(true);
        const missing = await db.query(`select count(*)::int as count from private.auth_otp where email='new@example.com'`);
        expect(missing.rows[0].count).toBe(0);
    });
});
