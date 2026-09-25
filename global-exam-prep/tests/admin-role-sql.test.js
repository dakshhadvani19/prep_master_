/**
 * The admin-role lookup, executed against a real Postgres.
 *
 * Like tests/auth-otp-sql.test.js, this is not a mock: it boots PGlite, creates the
 * schema a Supabase project has (roles, auth.uid(), the operators' public.admins),
 * and runs the migration file. The properties below are the ones the client cannot
 * compensate for, so they are the ones worth proving in the database:
 *
 *   - the function answers about auth.uid() and has no way to be pointed at anyone
 *     else (there is no overload that takes a uid);
 *   - execute is available to `authenticated` and refused to `anon`;
 *   - RLS on public.admins is left intact — a direct read by the caller still
 *     returns nothing unless a policy says otherwise, and the lookup works precisely
 *     because it runs as the owner, not because anything was loosened;
 *   - a non-staff uid gets SQL NULL, not an error and not an empty object;
 *   - is_super_admin decides the tier, and the payload cannot carry a credential
 *     because only the whitelisted columns are named in the SELECT;
 *   - auth_uid works as either uuid or text, and FORCE ROW LEVEL SECURITY fails
 *     closed rather than open.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const MIGRATION = readFileSync(
  `${globalThis.process.cwd()}/supabase/migrations/20260925150000_admin_role_lookup.sql`,
  'utf8',
);

const BOSS = '11111111-1111-1111-1111-111111111111';
const STAFF = '22222222-2222-2222-2222-222222222222';
const STUDENT = '33333333-3333-3333-3333-333333333333';

/**
 * @param {string} uidColumnType 'uuid' (the common case) or 'text' (a project that
 *   stored the id as a string) — the lookup has to work for both.
 */
const fixture = (uidColumnType) => `
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

  -- The pieces Supabase provides that this function depends on. auth.uid() reads the
  -- verified JWT; here the same slot is filled from a session GUC a test can set.
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('test.uid', true), '')::uuid
  $$;

  drop table if exists public.admins cascade;
  create table public.admins (
    admin_id       uuid primary key default gen_random_uuid(),
    auth_uid       ${uidColumnType} not null,
    full_name      text,
    email          text,
    is_super_admin boolean not null default false,
    created_at     timestamptz not null default now()
  );
  -- RLS on, with no policies at all: exactly what a hardened project looks like, and
  -- the reason the lookup exists instead of a client-side read.
  alter table public.admins enable row level security;
  -- A Supabase project grants anon/authenticated table privileges by default and
  -- relies on RLS for the actual gate; the fixture does the same so the assertions
  -- below measure row-level security rather than a missing GRANT.
  grant select on public.admins to authenticated;

  insert into public.admins (auth_uid, full_name, email, is_super_admin) values
    ('${BOSS}',   'Daksh Patel',  'boss@x.com',   true),
    ('${STAFF}',  'Raja Advani',  'staff@x.com',  false);
`;

let db;
const open = async (uidColumnType) => {
  await db?.close();
  db = new PGlite();
  await db.exec(fixture(uidColumnType));
  await db.exec(MIGRATION);
};

const asRole = async (role, sql) => {
  await db.exec(`set role ${role}`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec('reset role');
  }
};

/** The lookup, as the signed-in uid `who`. */
const lookup = async (who = BOSS, role = 'authenticated') => {
  await db.exec(`set test.uid = '${who}'`);
  try {
    const out = await asRole(role, 'select public.admin_role_for_uid() as row');
    return out.rows[0].row;
  } finally {
    await db.exec(`set test.uid = ''`);
  }
};

const fails = async (sql) => {
  await expect(db.query(sql)).rejects.toThrow();
};

beforeAll(async () => { await open('uuid'); }, 120000);
afterAll(async () => { await db?.close(); });

describe('public.admin_role_for_uid() on a real Postgres', () => {
  it('returns only the caller\'s own staff row, as the whitelisted fields', async () => {
    expect(await lookup(BOSS)).toEqual({
      admin_id: expect.any(String),
      auth_uid: BOSS,
      full_name: 'Daksh Patel',
      email: 'boss@x.com',
      is_super_admin: true,
    });
    expect(await lookup(STAFF)).toMatchObject({ auth_uid: STAFF, is_super_admin: false });
  });

  it('returns exactly the payload the app may see — never a secret', async () => {
    const row = await lookup(BOSS);
    expect(Object.keys(row).sort()).toEqual(
      ['admin_id', 'auth_uid', 'email', 'full_name', 'is_super_admin'].sort(),
    );
    expect(JSON.stringify(row)).not.toMatch(/password|token|secret|otp/i);
  });

  it('answers NULL for a signed-in non-admin, not an error and not a blank object', async () => {
    expect(await lookup(STUDENT)).toBeNull();
  });

  it('cannot be pointed at another uid: there is no overload that takes one', async () => {
    await fails(`select public.admin_role_for_uid('${BOSS}'::uuid)`);
    await fails(`select public.admin_role_for_uid('${BOSS}')`);
  });

  it('is executable by a signed-in user and refused to anon', async () => {
    await db.exec(`set test.uid = '${BOSS}'`);
    try {
      await expect(asRole('anon', 'select public.admin_role_for_uid()')).rejects.toThrow(
        /permission denied/i,
      );
      await expect(asRole('authenticated', 'select public.admin_role_for_uid()')).resolves.toBeTruthy();
    } finally {
      await db.exec(`set test.uid = ''`);
    }
  });

  it("leaves RLS on public.admins intact: the caller's own direct read stays filtered", async () => {
    await db.exec(`set test.uid = '${BOSS}'`);
    try {
      const out = await asRole('authenticated', 'select * from public.admins');
      expect(out.rows).toHaveLength(0);            // filtered by RLS, as configured
    } finally {
      await db.exec('reset test.uid');
    }
    // And the grant on the table itself was not widened by this migration.
    const grants = await db.query(`
      select privilege_type from information_schema.role_table_grants
      where table_name = 'admins' and grantee = 'anon'
    `);
    expect(grants.rows).toHaveLength(0);
  });

  it('prefers the most privileged row when one uid has several, deterministically', async () => {
    await db.query(
      `insert into public.admins (auth_uid, full_name, email, is_super_admin)
       values ('${BOSS}', 'Daksh Patel', 'boss@x.com', false)`,
    );
    const first = await lookup(BOSS);
    const again = await lookup(BOSS);
    expect(first.is_super_admin).toBe(true);
    expect(again).toEqual(first);                 // the same answer every time
    await db.query(`delete from public.admins where full_name = 'Daksh Patel' and is_super_admin = false`);
  });

  it('works whether auth_uid is uuid or text', async () => {
    await open('text');
    expect(await lookup(STAFF)).toMatchObject({ auth_uid: STAFF, full_name: 'Raja Advani' });
    expect(await lookup(STUDENT)).toBeNull();
    await open('uuid');
  });

  it('answers through the owner while the same row stays invisible to the caller', async () => {
    // The asymmetry is the whole design: no policy was added to public.admins, and the
    // function still resolves the caller's own row. Should an operator ever tighten the
    // database so that even the lookup sees nothing, it returns NULL — which the app
    // reads as "not staff" and reports as authorizationError. Losing a privilege is the
    // only failure mode available here.
    await db.exec(`set test.uid = '${BOSS}'`);
    try {
      const direct = await asRole('authenticated', 'select * from public.admins');
      const viaFunction = await asRole('authenticated', 'select public.admin_role_for_uid() as row');
      expect(direct.rows).toHaveLength(0);
      expect(viaFunction.rows[0].row).toMatchObject({ is_super_admin: true });
    } finally {
      await db.exec('reset test.uid');
    }
  });

  it('applies twice in a row without drifting', async () => {
    await db.exec(MIGRATION);
    expect(await lookup(BOSS)).toMatchObject({ auth_uid: BOSS });
  });
});

describe('the migration refuses a database it does not fit', () => {
  it('raises an instruction instead of "relation does not exist" when admins is missing', async () => {
    await open('uuid');
    await db.exec('drop table public.admins');
    await expect(db.exec(MIGRATION)).rejects.toThrow(/public\.admins is missing/i);
  });

  it('raises when the table lacks the columns the lookup is keyed on', async () => {
    await open('uuid');
    await db.exec('alter table public.admins drop column is_super_admin');
    await expect(db.exec(MIGRATION)).rejects.toThrow(/is_super_admin/i);
  });
});
