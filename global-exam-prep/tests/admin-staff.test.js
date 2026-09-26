import { describe, it, expect, vi } from 'vitest';
import { manageAdminStaff, ADMIN_STAFF_FUNCTION } from '../src/utils/supabaseAuth.js';

function client(rpcImpl) {
  return { rpc: vi.fn(rpcImpl) };
}

describe('manageAdminStaff()', () => {
  it('sends only action, email, and name to the RPC — never a caller is_super_admin flag', async () => {
    const c = client(async () => ({ data: { ok: true, action: 'add', email: 'n@x.com' }, error: null }));
    const out = await manageAdminStaff(c, { action: 'add', email: 'n@x.com', fullName: 'New' });
    expect(c.rpc).toHaveBeenCalledWith(ADMIN_STAFF_FUNCTION, {
      p_action: 'add',
      p_email: 'n@x.com',
      p_full_name: 'New',
    });
    expect(JSON.stringify(c.rpc.mock.calls[0][1])).not.toMatch(/is_super_admin|isSuperAdmin/);
    expect(out.ok).toBe(true);
  });

  it('maps not_authorized to a super-admin-only message', async () => {
    const c = client(async () => ({ data: null, error: { code: '42501', message: 'not_authorized' } }));
    await expect(manageAdminStaff(c, { action: 'remove', email: 'a@x.com' }))
      .rejects.toThrow(/Only a Super Admin/i);
  });

  it('maps a missing function to an honest “not applied” error', async () => {
    const c = client(async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }));
    await expect(manageAdminStaff(c, { action: 'add', email: 'a@x.com' }))
      .rejects.toThrow(/not applied/i);
  });

  it('rejects an unknown action before calling the network', async () => {
    const c = client(async () => ({ data: null, error: null }));
    await expect(manageAdminStaff(c, { action: 'yes', email: 'a@x.com' })).rejects.toThrow(/not valid/i);
    expect(c.rpc).not.toHaveBeenCalled();
  });
});
