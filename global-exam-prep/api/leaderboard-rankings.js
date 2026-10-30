import { createClient } from '@supabase/supabase-js';

const process = globalThis.process;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE_OFFSET = 100000;

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

function fail(res, status, message) {
    return res.status(status).json({ error: message });
}

function readOptionalFilter(value, field, { allowed = null, maxLength = 80 } = {}) {
    if (value === undefined || value === null) return { value: null, error: null };
    if (typeof value !== 'string') {
        return { value: null, error: `The ${field} filter is invalid.` };
    }

    const normalized = value.trim();
    if (!normalized || normalized.toLowerCase() === 'all') return { value: null, error: null };
    if (normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
        return { value: null, error: `The ${field} filter is invalid.` };
    }

    const output = allowed ? normalized.toLowerCase() : normalized;
    if (allowed && !allowed.includes(output)) {
        return { value: null, error: `Choose a valid ${field.toLowerCase()} filter.` };
    }
    return { value: output, error: null };
}

function readInteger(value, fallback, min, max, field) {
    if (value === undefined || value === null || value === '') return { value: fallback, error: null };
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
        return { value: null, error: `The ${field} value is invalid.` };
    }
    return { value: parsed, error: null };
}

async function authenticate(req, admin) {
    const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (!match) return { user: null, unauthorized: true };

    const { data, error } = await admin.auth.getUser(match[1]);
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
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return fail(res, 405, 'This request method is not supported.');
    }

    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body
        : null;
    if (!body) return fail(res, 400, 'The leaderboard request is invalid.');

    const subjectId = Number(body.subjectId);
    if (!Number.isSafeInteger(subjectId) || subjectId <= 0) {
        return fail(res, 400, 'Select a valid subject to view its leaderboard.');
    }

    const examType = readOptionalFilter(body.examType, 'Exam type');
    const difficulty = readOptionalFilter(body.difficulty, 'Difficulty', {
        allowed: ['easy', 'medium', 'hard'],
    });
    const attemptType = readOptionalFilter(body.attemptType, 'Attempt type', {
        allowed: ['exam', 'test_room'],
    });
    const limit = readInteger(body.limit, 50, 1, MAX_PAGE_SIZE, 'Page size');
    const offset = readInteger(body.offset, 0, 0, MAX_PAGE_OFFSET, 'Page offset');

    const validationError = [
        examType.error,
        difficulty.error,
        attemptType.error,
        limit.error,
        offset.error,
    ].find(Boolean);
    if (validationError) return fail(res, 400, validationError);

    try {
        const admin = adminClient();
        const auth = await authenticate(req, admin);
        if (auth.unauthorized || !auth.user?.id) {
            return fail(res, 401, 'Your session could not be verified. Sign in again and retry.');
        }

        // Confirm the requested ID is still a catalog subject. Never accept a
        // course/semester/name supplied by the browser as authoritative metadata.
        const { data: subject, error: subjectError } = await admin
            .from('Subjects')
            .select('SubjectId')
            .eq('SubjectId', subjectId)
            .maybeSingle();
        if (subjectError) throw subjectError;
        if (!subject) return fail(res, 404, 'This subject is no longer available in the catalog.');

        // The user ID comes only from Supabase Auth's verified access token.
        // Caller-supplied userId/studentId fields are intentionally ignored.
        const { data, error } = await admin.rpc('pm_leaderboard_rankings', {
            p_subject_id: subjectId,
            p_user_id: auth.user.id,
            p_exam_type: examType.value,
            p_difficulty: difficulty.value,
            p_attempt_type: attemptType.value,
            p_limit: limit.value,
            p_offset: offset.value,
        });
        if (error) throw error;
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('Leaderboard query returned an invalid response.');
        }

        return res.status(200).json({ leaderboard: data });
    } catch (error) {
        // Actual provider/database details remain server-side for debugging.
        // Do not send Postgres, PostgREST, Auth, or infrastructure errors to users.
        console.error('[leaderboard-rankings] request failed:', error);
        return fail(res, 503, 'We could not load this leaderboard right now. Please try again.');
    }
}
