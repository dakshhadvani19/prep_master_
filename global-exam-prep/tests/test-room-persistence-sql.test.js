import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const MIGRATION = readFileSync(
    `${globalThis.process.cwd()}/supabase/migrations/20261025120000_test_room_attempt_persistence.sql`,
    'utf8',
);
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

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
    `);
    await db.exec(MIGRATION);
}, 120000);

afterAll(async () => { await db?.close(); });

async function asUser(uid, role, query) {
    await db.exec(`set test.uid = '${uid}'`);
    await db.exec(`set role ${role}`);
    try {
        return await db.query(query);
    } finally {
        await db.exec('reset role');
        await db.exec("set test.uid = ''");
    }
}

describe('Test Room persistence migration', () => {
    it('creates RLS-protected attempt storage and a private answer-key table', async () => {
        const rls = await db.query(`
            select c.relname, c.relrowsecurity
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname in ('exam_attempts', 'exam_grades', 'exam_attempt_keys')
        `);
        expect(rls.rows).toEqual(expect.arrayContaining([
            { relname: 'exam_attempts', relrowsecurity: true },
            { relname: 'exam_grades', relrowsecurity: true },
            { relname: 'exam_attempt_keys', relrowsecurity: true },
        ]));
    });

    it('restricts authenticated users to their own attempt rows', async () => {
        await db.query(`
            insert into public.exam_attempts (user_id, subject_name, questions, attempt_type, status, room_code)
            values
                ('${USER_A}', 'Room A', '[]'::jsonb, 'test_room', 'in_progress', 'ROOMAAA111'),
                ('${USER_B}', 'Room B', '[]'::jsonb, 'test_room', 'in_progress', 'ROOMBBB222')
        `);
        const result = await asUser(USER_A, 'authenticated', 'select user_id from public.exam_attempts');
        expect(result.rows).toEqual([{ user_id: USER_A }]);
    });

    it('does not let browser clients create Test Room attempts directly', async () => {
        await expect(asUser(USER_A, 'authenticated', `
            insert into public.exam_attempts (user_id, subject_name, attempt_type, room_code)
            values ('${USER_A}', 'Forged', 'test_room', 'FORGEDROOM1')
        `)).rejects.toThrow(/row-level security|policy|permission/i);
    });

    it('keeps answer keys inaccessible to authenticated browser clients', async () => {
        const attempt = await db.query(`
            insert into public.exam_attempts (user_id, subject_name, attempt_type, status, room_code)
            values ('${USER_A}', 'Room A', 'test_room', 'in_progress', 'KEYROOM1111')
            returning id
        `);
        await db.query(`
            insert into public.exam_attempt_keys (attempt_id, answer_key)
            values ('${attempt.rows[0].id}', '[0,1,2]'::jsonb)
        `);
        await expect(asUser(USER_A, 'authenticated', 'select answer_key from public.exam_attempt_keys'))
            .rejects.toThrow(/permission denied/i);
        const serverRead = await db.query('select answer_key from public.exam_attempt_keys');
        expect(serverRead.rows[0].answer_key).toEqual([0, 1, 2]);
    });

    it('prevents duplicate Test Room attempts for the same user and code', async () => {
        await db.query(`
            insert into public.exam_attempts (user_id, subject_name, attempt_type, room_code)
            values ('${USER_A}', 'Room A', 'test_room', 'UNIQUE1111')
        `);
        await expect(db.query(`
            insert into public.exam_attempts (user_id, subject_name, attempt_type, room_code)
            values ('${USER_A}', 'Room A again', 'test_room', 'UNIQUE1111')
        `)).rejects.toThrow(/unique|duplicate/i);
    });
});
