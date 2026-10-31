/**
 * The authorization rule, on its own: how a session becomes a role.
 *
 * resolveAuthorization() + deriveRole() are the whole of the app's admin logic, so
 * every failure mode that matters gets pinned here without React in the way:
 * the lookup is keyed by the authenticated uid and nothing else, the RPC is the
 * primary read with the caller's own row as fallback, and every error path ends at
 * "student" — the answer that grants nothing.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveAuthorization, deriveRole, ADMIN_LOOKUP_FUNCTION } from '../src/utils/supabaseAuth.js';

function fakeClient({ rpcResult, selectResult, rpcThrows = false } = {}) {
  const log = [];
  let pending = null;

  return {
    log,

    ...(rpcResult === undefined ? {} : {
      rpc: vi.fn(async (name, args) => {
        log.push({ kind: 'rpc', name, args: args === undefined ? null : args });
        if (rpcThrows) throw new Error('fetch failed');
        return rpcResult;
      }),
    }),

    from(table) {
      pending = { kind: 'select', table, cols: null, filters: {} };
      log.push(pending);

      const b = {
        select: (cols) => { pending.cols = cols; return b; },
        eq: (k, v) => { pending.filters[k] = v; return b; },
        maybeSingle: async () => {
          pending.result = selectResult ?? { data: null, error: null };
          return pending.result;
        },
        insert: vi.fn(async (payload) => {
          pending.payload = payload;
          return { error: null };
        }),
        update: vi.fn(async (payload) => {
          pending.payload = payload;
          return { error: null };
        }),
      };

      return b;
    },
  };
}

const STAFF_ROW = {
  AdminId: 11,
  auth_uid: 'u1',
  FullName: 'Daksh Patel',
  Email: 'Admin@X.com',
  isSuperAdmin: false,
};

describe('resolveAuthorization()', () => {
  it('asks the lookup function about the caller, and about nobody else', async () => {
    const client = fakeClient({ rpcResult: { data: STAFF_ROW, error: null } });

    const out = await resolveAuthorization(client, 'u1');

    expect(client.log).toEqual([{ kind: 'rpc', name: ADMIN_LOOKUP_FUNCTION, args: null }]);
    expect(out.source).toBe('rpc');
    expect(out.error).toBeNull();

    expect(out.row).toEqual({
      adminId: 11,
      authUid: 'u1',
      fullName: 'Daksh Patel',
      email: 'admin@x.com',
      isSuperAdmin: false,
    });

    expect(Object.keys(out.row).sort()).toEqual(
      ['adminId', 'authUid', 'email', 'fullName', 'isSuperAdmin'].sort(),
    );
  });

  it('a null from the function means "not staff", with nothing to report', async () => {
    const client = fakeClient({ rpcResult: { data: null, error: null } });

    const out = await resolveAuthorization(client, 'u1');

    expect(out).toEqual({ row: null, error: null, source: 'rpc' });
    expect(deriveRole(out.row)).toBe('student');
  });

  it('falls back to the caller\'s own row only when the function is not deployed', async () => {
    const client = fakeClient({
      rpcResult: {
        data: null,
        error: {
          code: 'PGRST202',
          message: 'Could not find the function public.admin_role_for_uid within the schema cache',
        },
      },
      selectResult: { data: { ...STAFF_ROW }, error: null },
    });

    const out = await resolveAuthorization(client, 'u1');

    const select = client.log.find((e) => e.kind === 'select');
    expect(select.table).toBe('Admins');
    expect(select.filters).toEqual({ auth_uid: 'u1' });
    expect(select.cols).not.toMatch(/password/i);
    expect(out.source).toBe('self-select');
    expect(deriveRole(out.row)).toBe('admin');
  });

  it('does not go looking for a wider read when the function exists but denies', async () => {
    const client = fakeClient({
      rpcResult: {
        data: null,
        error: { code: '42501', message: 'permission denied for function admin_role_for_uid' },
      },
      selectResult: { data: STAFF_ROW, error: null },
    });

    const out = await resolveAuthorization(client, 'u1');

    expect(client.log.map((e) => e.kind)).toEqual(['rpc']);
    expect(out.row).toBeNull();
    expect(out.error).toBeTruthy();
    expect(deriveRole(out.row)).toBe('student');
  });

  it('reads a boolean however the driver spelled it, and nothing else', async () => {
    for (const flag of ['t', true, 1, 'true']) {
      const out = await resolveAuthorization(
        fakeClient({ rpcResult: { data: { ...STAFF_ROW, isSuperAdmin: flag }, error: null } }),
        'u1',
      );
      expect(out.row.isSuperAdmin).toBe(true);
      expect(deriveRole(out.row)).toBe('superAdmin');
    }

    for (const flag of [false, null, undefined, 0, 'false', 'yes-but-not-really']) {
      const out = await resolveAuthorization(
        fakeClient({ rpcResult: { data: { ...STAFF_ROW, isSuperAdmin: flag }, error: null } }),
        'u1',
      );
      expect(out.row.isSuperAdmin).toBe(false);
      expect(deriveRole(out.row)).toBe('admin');
    }
  });

  it('treats a non-object answer as "not staff" rather than as truthy', async () => {
    for (const data of [true, 'admin', 1, [], '']) {
      const out = await resolveAuthorization(
        fakeClient({ rpcResult: { data, error: null } }),
        'u1',
      );
      expect(out.row).toBeNull();
      expect(deriveRole(out.row)).toBe('student');
    }
  });

  it('ignores a row that belongs to a different account, and says so', async () => {
    const out = await resolveAuthorization(
      fakeClient({
        rpcResult: {
          data: { ...STAFF_ROW, auth_uid: 'someone-else' },
          error: null,
        },
      }),
      'u1',
    );

    expect(out.row).toBeNull();
    expect(out.error?.message).toMatch(/different account/i);
    expect(deriveRole(out.row)).toBe('student');

    const viaSelect = await resolveAuthorization(
      fakeClient({
        rpcResult: {
          data: null,
          error: {
            code: 'PGRST202',
            message: 'Could not find the function public.admin_role_for_uid',
          },
        },
        selectResult: {
          data: { ...STAFF_ROW, auth_uid: 'someone-else' },
          error: null,
        },
      }),
      'u1',
    );

    expect(viaSelect.row).toBeNull();
    expect(viaSelect.error?.message).toMatch(/different account/i);
  });

  it('surfaces a transport failure as an error, never as a thrown one', async () => {
    const client = fakeClient({
      rpcThrows: true,
      selectResult: {
        data: null,
        error: { code: 'ENOTFOUND', message: 'fetch failed' },
      },
    });

    const out = await resolveAuthorization(client, 'u1');

    expect(out.row).toBeNull();
    expect(out.error).toBeTruthy();
    expect(out.source).toBe('self-select');
  });

  it('asks nothing at all without a session', async () => {
    const client = fakeClient({ rpcResult: { data: STAFF_ROW, error: null } });

    expect(await resolveAuthorization(client, null)).toEqual({
      row: null,
      error: null,
      source: 'anonymous',
    });

    expect(await resolveAuthorization(null, 'u1')).toEqual({
      row: null,
      error: null,
      source: 'anonymous',
    });

    expect(client.log).toHaveLength(0);
  });
});

describe('deriveRole()', () => {
  it('maps the staff row to exactly one of the three roles', () => {
    expect(deriveRole(null)).toBe('student');
    expect(deriveRole({ isSuperAdmin: false })).toBe('admin');
    expect(deriveRole({ isSuperAdmin: true })).toBe('superAdmin');
    expect(deriveRole({ isSuperAdmin: 'true' })).toBe('superAdmin');
    expect(deriveRole({ isSuperAdmin: 1 })).toBe('superAdmin');
    expect(deriveRole({ isSuperAdmin: undefined })).toBe('admin');
  });
});
