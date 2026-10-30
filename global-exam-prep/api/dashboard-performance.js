import { createClient } from '@supabase/supabase-js';

const process = globalThis.process;

function envFirst(...names) {
    for (const name of names) {
        if (process.env[name]?.trim()) return process.env[name].trim();
    }
    return '';
}

function createAdminClient() {
    const url = envFirst('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/+$/, '');
    let key = envFirst('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
    if (!key) {
        try {
            key = JSON.parse(process.env.SUPABASE_SECRET_KEYS || '{}').default || '';
        } catch {
            key = '';
        }
    }
    if (!url || !key) throw new Error('Supabase server credentials are not configured.');
    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
}

function respond(res, status, message) {
    return res.status(status).json({ error: message });
}

async function authenticate(req, admin) {
    const tokenMatch = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) return { user: null, unauthorized: true };

    const { data, error } = await admin.auth.getUser(tokenMatch[1]);
    if (error) {
        if ([400, 401, 403].includes(Number(error.status))) {
            return { user: null, unauthorized: true };
        }
        throw error;
    }
    return { user: data?.user || null, unauthorized: !data?.user };
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET, OPTIONS');
        return respond(res, 405, 'This request method is not supported.');
    }

    try {
        const admin = createAdminClient();
        const auth = await authenticate(req, admin);
        if (auth.unauthorized || !auth.user?.id) {
            return respond(res, 401, 'Your session could not be verified. Sign in again and retry.');
        }

        const { data: student, error: studentError } = await admin
            .from('Students')
            .select('StudentId')
            .eq('auth_uid', auth.user.id)
            .eq('role', 'student')
            .maybeSingle();
        if (studentError) throw studentError;
        if (!student) {
            return respond(res, 403, 'A student profile is required to view performance history.');
        }

        const { data, error } = await admin.rpc('pm_dashboard_performance_summary', {
            p_user_id: auth.user.id,
        });
        if (error) throw error;
        if (!data || typeof data !== 'object' || Array.isArray(data)
            || !data.summary || !Array.isArray(data.subjectPerformance)
            || !Array.isArray(data.recentResults)) {
            throw new Error('Dashboard performance service returned an invalid response.');
        }

        return res.status(200).json({ performance: data });
    } catch (error) {
        // Preserve real Supabase/Postgres details in server logs only.
        console.error('[dashboard-performance] request failed:', error);
        return respond(res, 503, 'We could not load your performance summary right now. Please try again.');
    }
}
