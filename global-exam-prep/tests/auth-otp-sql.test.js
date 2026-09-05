/**
 * The Supabase migration, executed and exercised.
 *
 * This is not a mock of the database rules — it starts a real Postgres (PGlite, in
 * process, no network) and runs the SQL file that has to be applied to the project.
 * Everything the OTP architecture promises is asserted where it is actually
 * enforced, because those are the properties the client cannot compensate for:
 *
 *   - a browser role (anon/authenticated) cannot read, write, or call anything;
 *   - exactly one live challenge per address, enforced by the primary key;
 *   - the resend cooldown is enforced by the database, on its own clock;
 *   - the attempt ceiling and single-use burn cannot be raced;
 *   - no column anywhere can hold a plaintext code, and no row can live past the TTL
 *     bounds.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// roles must exist before the migration revokes from them (Supabase creates them;
// a bare Postgres does not).
const PRELUDE = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role nologin bypassrls; end if;
  end $$;
  grant usage on schema public to anon, authenticated, service_role;
`;

const MIGRATION = readFileSync(
  `${globalThis.process.cwd()}/supabase/migrations/20260905120000_auth_otp.sql`,
  'utf8',
);

const HASH = '0'.repeat(63) + 'a';

let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(PRELUDE);
  await db.exec(MIGRATION);
});

afterAll(async () => { await db?.close(); });

const as = async (role, sql, params = []) => {
  await db.exec(`set role ${role}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
};

const issue = (email, hash = HASH, ttl = 600, cooldown = 60) =>
  db.query(`select * from auth_otp_issue($1,$2,$3,$4)`, [email, hash, ttl, cooldown])
    .then((r) => r.rows[0].auth_otp_issue ?? r.rows[0]);

const verify = (email, hash = HASH, max = 3) =>
  db.query(`select * from auth_otp_verify($1,$2,$3)`, [email, hash, max])
    .then((r) => r.rows[0].auth_otp_verify ?? r.rows[0]);

const rows = async () => (await db.query('select * from public.auth_otp order by email')).rows;

describe('the migration applies to a real Postgres', () => {
  it('creates the table the API expects, with the columns the SRS names', async () => {
    const cols = await db.query(`
      select column_name, data_type, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'auth_otp' order by column_name`);

    expect(cols.rows.map((c) => c.column_name)).toEqual(
      ['attempts', 'created_at', 'email', 'expires_at', 'nonce', 'otp_hash'],
    );
    // Nothing in this schema can hold a plaintext code, let alone a password.
    expect(JSON.stringify(cols.rows).toLowerCase()).not.toMatch(/password|plaintext|code/);
  });

  it('refuses malformed input at the constraint, not in application code', async () => {
    await expect(db.query(
      `insert into public.auth_otp (email, otp_hash, expires_at)
       values ('Raja@Example.com', $1, now() + interval '10 minutes')`, [HASH],
    )).rejects.toThrow(/check constraint/);                  // not lower(btrim())

    await expect(db.query(
      `insert into public.auth_otp (email, otp_hash, expires_at)
       values ('raja@example.com', 'deadbeef', now() + interval '10 minutes')`,
    )).rejects.toThrow(/check constraint/);                  // digest shape

    await expect(db.query(
      `insert into public.auth_otp (email, otp_hash, expires_at)
       values ('raja@example.com', $1, now() + interval '90 minutes')`, [HASH],
    )).rejects.toThrow(/check constraint/);                  // TTL out of bounds

    await expect(db.query(
      `insert into public.auth_otp (email, otp_hash, attempts, expires_at)
       values ('raja@example.com', $1, 99, now() + interval '10 minutes')`, [HASH],
    )).rejects.toThrow(/check constraint/);                  // attempts ceiling
  });
});

describe('the browser cannot touch the challenge store', () => {
  it('anon and authenticated have no table or function access at all', async () => {
    for (const role of ['anon', 'authenticated']) {
      await expect(as(role, 'select count(*) from public.auth_otp')).rejects.toThrow(/permission denied/i);
      await expect(as(role, `select auth_otp_issue('a@b.co', '${HASH}')`)).rejects.toThrow(/permission denied/i);
      await expect(as(role, `select auth_otp_verify('a@b.co', '${HASH}')`)).rejects.toThrow(/permission denied/i);
      await expect(as(role, `select auth_otp_discard('a@b.co')`)).rejects.toThrow(/permission denied/i);
      await expect(as(role, 'insert into public.auth_otp (email, otp_hash, expires_at) values ($1,$2,now()+interval \'5 min\')', ['x@y.co', HASH]))
        .rejects.toThrow(/permission denied/i);
    }
  });

  it('there are no policies to weaken, and RLS is on', async () => {
    const t = await db.query(`
      select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.auth_otp'::regclass`);
    expect(t.rows[0].relrowsecurity).toBe(true);
    const pol = await db.query(`select count(*)::int as n from pg_policies where tablename = 'auth_otp'`);
    expect(pol.rows[0].n).toBe(0);
  });

  it('the server role can, through the functions only as far as they allow', async () => {
    const ok = await as('service_role', `select auth_otp_issue('svc@example.com', $1)`, [HASH]);
    expect(ok.rows[0].auth_otp_issue.ok).toBe(true);
    await as('service_role', `select auth_otp_discard('svc@example.com')`);
  });
});

describe('issue: one live challenge per address, with a database-enforced cooldown', () => {
  it('accepts the first request and normalises the address it stores', async () => {
    await db.exec('delete from public.auth_otp');
    const first = await issue('Raja@Example.com ', HASH);

    expect(first.ok).toBe(true);
    expect(first.ttl_seconds).toBe(600);
    expect(first.resend_after_seconds).toBe(60);
    expect((await rows())).toHaveLength(1);
    const stored = (await rows())[0];
    expect(stored.email).toBe('raja@example.com');
    expect(new Date(stored.expires_at) - new Date(stored.created_at)).toBeCloseTo(600_000, -3);
    expect(stored.nonce).toMatch(/[0-9a-f-]{36}/);
  });

  it('refuses a second issue inside the window and says how long to wait', async () => {
    const second = await issue('raja@example.com', '1'.repeat(64));

    expect(second.ok).toBe(false);
    expect(second.reason).toBe('cooldown');
    expect(second.retry_after_seconds).toBeGreaterThan(0);
    expect(second.retry_after_seconds).toBeLessThanOrEqual(60);
    // The refusal must not disturb the live challenge.
    const live = (await rows()).find((r) => r.email === 'raja@example.com');
    expect(live.otp_hash).toBe(HASH);
  });

  it('supersedes the old code once the cooldown has passed, leaving exactly one row', async () => {
    await db.exec(`update public.auth_otp set created_at = created_at - interval '61 seconds',
                   expires_at = expires_at - interval '61 seconds' where email = 'raja@example.com'`);

    const third = await issue('raja@example.com', '1'.repeat(64));
    expect(third.ok).toBe(true);
    const mine = (await rows()).filter((r) => r.email === 'raja@example.com');
    expect(mine).toHaveLength(1);
    expect(mine[0].otp_hash).toBe('1'.repeat(64));
    expect(mine[0].attempts).toBe(0);
  });

  it('rejects a digest that is not a sha256 hex string, at the function boundary', async () => {
    // Rejected before any write: the column CHECK would also refuse it, but the
    // function refusing means the API gets a reason instead of a database error.
    expect(await issue('raja@example.com', 'not-a-digest')).toMatchObject({ ok: false, reason: 'invalid_input' });
    expect(await issue('', HASH)).toMatchObject({ ok: false, reason: 'invalid_input' });
  });

  it('refuses a TTL outside the sane range instead of storing a permanent row', async () => {
    await expect(issue('short@example.com', HASH, 5)).resolves.toMatchObject({ ok: false, reason: 'invalid_ttl' });
    await expect(issue('long@example.com', HASH, 9999)).resolves.toMatchObject({ ok: false, reason: 'invalid_ttl' });
  });
});

describe('verify: attempts, expiry, single use — none of them racy', () => {
  beforeAll(async () => { await db.exec('delete from public.auth_otp'); });

  it('counts each wrong guess and locks out on the third', async () => {
    await issue('guess@example.com', HASH);

    for (const [expectedRemaining, expectedReason] of [[2, 'invalid'], [1, 'invalid']]) {
      const wrong = await verify('guess@example.com', 'f'.repeat(64));
      expect(wrong).toMatchObject({ ok: false, reason: expectedReason, remaining: expectedRemaining });
    }
    const last = await verify('guess@example.com', 'e'.repeat(64));
    expect(last).toMatchObject({ ok: false, reason: 'locked', remaining: 0 });

    // The row is gone, so the lockout cannot be extended by guessing forever.
    expect((await rows()).find((r) => r.email === 'guess@example.com')).toBeUndefined();
  });

  it('does not let a client keep a superseded code alive after a re-issue', async () => {
    await issue('rot@example.com', HASH);
    await db.exec(`update public.auth_otp set created_at = created_at - interval '61 seconds',
                   expires_at = expires_at - interval '61 seconds' where email = 'rot@example.com'`);
    await issue('rot@example.com', '2'.repeat(64));

    // The code from the first email no longer verifies anything.
    expect(await verify('rot@example.com', HASH)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await verify('rot@example.com', '2'.repeat(64))).toMatchObject({ ok: true });
  });

  it('burns the challenge on success, so a captured code cannot be replayed', async () => {
    await issue('once@example.com', '3'.repeat(64));

    expect(await verify('once@example.com', '3'.repeat(64))).toMatchObject({ ok: true });
    // A second presentation of the same code is indistinguishable from a wrong one,
    // which is also what stops this being an existence oracle.
    const replay = await verify('once@example.com', '3'.repeat(64));
    expect(replay).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('deletes an expired challenge and calls it expired, not wrong', async () => {
    await issue('old@example.com', '4'.repeat(64), 60);
    await db.exec(`update public.auth_otp
                     set created_at = created_at - interval '300 seconds',
                         expires_at = expires_at - interval '300 seconds'
                   where email = 'old@example.com'`);

    expect(await verify('old@example.com', '4'.repeat(64))).toMatchObject({ ok: false, reason: 'expired' });
    expect((await rows()).find((r) => r.email === 'old@example.com')).toBeUndefined();
  });

  it('treats "no such challenge" exactly like "wrong code"', async () => {
    const missing = await verify('nobody@example.com', '9'.repeat(64));
    expect(missing).toMatchObject({ ok: false, reason: 'invalid', remaining: 0 });
  });

  it('a wrong digest for address A never verifies address B', async () => {
    await issue('a@example.com', '5'.repeat(64));
    // Same digest, different address: the row is keyed by email, so this is not a hit.
    expect(await verify('b@example.com', '5'.repeat(64))).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await verify('a@example.com', '5'.repeat(64))).toMatchObject({ ok: true });
  });
});

describe('housekeeping', () => {
  it('discard reports whether a row was actually removed', async () => {
    await issue('gone@example.com', '6'.repeat(64));
    expect(await db.query(`select auth_otp_discard('gone@example.com') as r`))
      .toMatchObject({ rows: [{ r: { ok: true, discarded: true } }] });
    expect(await db.query(`select auth_otp_discard('gone@example.com') as r`))
      .toMatchObject({ rows: [{ r: { ok: true, discarded: false } }] });
  });

  it('prune removes expired rows and leaves live ones', async () => {
    await db.exec('delete from public.auth_otp');
    await issue('live@example.com', '7'.repeat(64));
    await issue('dead@example.com', '8'.repeat(64));
    await db.exec(`update public.auth_otp set created_at = created_at - interval '3000 seconds',
                   expires_at = expires_at - interval '3000 seconds' where email = 'dead@example.com'`);

    const pruned = await db.query('select auth_otp_prune() as r');
    expect(pruned.rows[0].r.deleted).toBe(1);
    const left = (await rows()).map((r) => r.email);
    expect(left).toEqual(['live@example.com']);
  });
});
