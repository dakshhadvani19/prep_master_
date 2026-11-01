import { supabase, requireSupabase } from '../supabase.js';

export async function manageAdminSubject(payload) {
    requireSupabase();
    const { data, error } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (error || !token) throw new Error('Your session has expired. Sign in again.');
    const response = await fetch('/api/admin-subjects', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        const details = result.dependencies
            ? ' Linked records: ' + Object.entries(result.dependencies).filter(([, count]) => count > 0).map(([table, count]) => table + ': ' + count).join(', ')
            : '';
        throw new Error((result.error || 'Subject management failed.') + details);
    }
    return result;
}
