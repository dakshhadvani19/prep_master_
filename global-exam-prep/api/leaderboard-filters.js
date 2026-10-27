import { createClient } from '@supabase/supabase-js';

const process = globalThis.process;

function envFirst(...names) {
    for (const name of names) {
        if (process.env[name]?.trim()) return process.env[name].trim();
    }
    return '';
}

function adminClient() {
    const url = envFirst('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/+$/, '');
    let key = envFirst('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
    if (!key) {
        try { key = JSON.parse(process.env.SUPABASE_SECRET_KEYS || '{}').default || ''; } catch { key = ''; }
    }
    if (!url || !key) throw new Error('Supabase server credentials are not configured.');
    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
}

function fail(res, status, message) {
    return res.status(status).json({ error: message });
}

async function authenticate(req, admin) {
    const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    const { data, error } = await admin.auth.getUser(match[1]);
    return error ? null : data?.user || null;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return fail(res, 405, 'Method not allowed.');

    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        if (body.action && body.action !== 'load') return fail(res, 400, 'Unknown leaderboard filter action.');

        const admin = adminClient();
        const user = await authenticate(req, admin);
        if (!user) return fail(res, 401, 'Sign in to check leaderboard access.');

        // The RPC is service-role-only and receives the verified user ID from the
        // server, never an arbitrary ID supplied by the browser.
        const { data, error } = await admin.rpc('pm_leaderboard_completed_subjects', {
            p_user_id: user.id,
        });
        if (error) throw new Error(error.message);
        return res.status(200).json({
            completedSubjects: Array.isArray(data) ? data : [],
        });
    } catch (error) {
        console.error('[leaderboard-filters] request failed:', error?.message || error);
        return fail(res, 503, 'Could not verify completed exams right now. Please retry.');
    }
}
