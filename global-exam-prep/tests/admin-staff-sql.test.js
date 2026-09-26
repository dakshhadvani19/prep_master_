/**
 * manage_admin_staff() against real Postgres (PGlite).
 * Super-admin only. No client table writes. Add requires auth.users.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const LOOKUP = readFileSync(
  `${globalThis.process.cwd()}/supabase/migrations/20260925150000_admin_role_lookup.sql`,
  'utf8',
);
const STAFF_FN = readFileSync(
  `${globalThis.process.cwd()}/supabase/migrations/20260926180000_manage_admin_staff.sql`,
  'utf8',
);

const BOSS = '11111111-1111-1111-1111-111111111111';
const STAFF = '22222222-2222-2222-2222-222222222222';
const STUDENT = '33333333-3333-3333-3333-333333333333';
const NEWBIE = '44444444-4444-4444-4444-444444444444';

const fixture = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticator') then
      create role authenticator nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role nologin bypassrls; end if;
  end $$;
  grant usage on schema public to anon, authenticated, service_role;
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('test.uid', true), '')::uuid
  $$;
  create table if not exists auth.users (
    id uuid primary key,
    email text
  );
  drop table if exists public.admins cascade;
  create table public.admins (
    admin_id       uuid primary key default gen_random_uuid(),
    auth_uid       uuid not null,
    full_name      text,
    email          text,
    is_super_admin boolean not null default false,
    created_at     timestamptz not null default now()
  );
  alter table public.admins enable row level security;
  grant select on public.admins to authenticated;
  insert into auth.users (id, email) values
    ('${BOSS}', 'boss@x.com'),
    ('${STAFF}', 'staff@x.com'),
    ('${STUDENT}', 'stu@x.com'),
    ('${NEWBIE}', 'new@x.com');
  insert into public.admins (auth_uid, full_name, email, is_super_admin) values
    ('${BOSS}',  'Daksh Patel', 'boss@x.com',  true),
    ('${STAFF}', 'Raja Advani', 'staff@x.com', false);
`;

let db;
const asRole = async (role, sql, params) => {
  await db.exec(`set role ${role}`);
  try {
    return params ? await db.query(sql, params) : await db.query(sql);
  } finally {
    await db.exec('reset role');
  }
};

const call = async (who, sql) => {
  await db.exec(`set test.uid = '${who}'`);
  try {
    return await asRole('authenticated', sql);
  } finally {
    await db.exec(`set test.uid = ''`);
  }
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fixture);
  await db.exec(LOOKUP);
  await db.exec(STAFF_FN);
}, 120000);

afterAll(async () => { await db?.close(); });

describe('public.manage_admin_staff()', () => {
  it('lets a super admin add staff for an existing auth user, without a table grant', async () => {
    const out = await call(BOSS, `select public.manage_admin_staff('add', 'new@x.com', 'New Person') as r`);
    expect(out.rows[0].r).toMatchObject({ ok: true, action: 'add', email: 'new@x.com' });
    const row = await db.query(`select full_name, is_super_admin from public.admins where email = 'new@x.com'`);
    expect(row.rows[0]).toMatchObject({ full_name: 'New Person', is_super_admin: false });
    await db.exec(`set test.uid = '${BOSS}'`);
    try {
      const direct = await asRole('authenticated', 'select * from public.admins where email = \'new@x.com\'');
      expect(direct.rows).toHaveLength(0);
    } finally {
      await db.exec(`set test.uid = ''`);
    }
  });

  it('refuses a standard admin and a student', async () => {
    await expect(call(STAFF, `select public.manage_admin_staff('add', 'new@x.com', 'X')`)).rejects.toThrow(/not_authorized/i);
    await expect(call(STUDENT, `select public.manage_admin_staff('add', 'new@x.com', 'X')`)).rejects.toThrow(/not_authorized/i);
  });

  it('refuses anon', async () => {
    await db.exec(`set test.uid = '${BOSS}'`);
    try {
      await expect(asRole('anon', `select public.manage_admin_staff('add', 'new@x.com', 'X')`)).rejects.toThrow(/permission denied/i);
    } finally {
      await db.exec(`set test.uid = ''`);
    }
  });

  it('cannot remove the caller', async () => {
    await expect(call(BOSS, `select public.manage_admin_staff('remove', 'boss@x.com', null)`)).rejects.toThrow(/cannot_remove_self/i);
  });

  it('promotes via add_super and removes another staff row', async () => {
    await call(BOSS, `select public.manage_admin_staff('add_super', 'new@x.com', 'New Person')`);
    const promoted = await db.query(`select is_super_admin from public.admins where email = 'new@x.com'`);
    expect(promoted.rows[0].is_super_admin).toBe(true);
    await call(BOSS, `select public.manage_admin_staff('remove', 'new@x.com', null)`);
    const gone = await db.query(`select 1 from public.admins where email = 'new@x.com'`);
    expect(gone.rows).toHaveLength(0);
  });

  it('refuses add when no auth.users row exists', async () => {
    await expect(call(BOSS, `select public.manage_admin_staff('add', 'ghost@x.com', 'Ghost')`)).rejects.toThrow(/no_auth_user/i);
  });
});
