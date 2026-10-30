import { createClient } from '@supabase/supabase-js';

const process = globalThis.process;
const FEEDBACK_TYPES = new Set(['general', 'bug', 'feature', 'content', 'other']);
const MAX_DESCRIPTION_LENGTH = 1000;

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
    if (!body) return fail(res, 400, 'The feedback request is invalid.');

    const type = body.type;
    if (typeof type !== 'string' || !FEEDBACK_TYPES.has(type)) {
        return fail(res, 400, 'Choose a valid feedback type.');
    }

    const rating = body.rating;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return fail(res, 400, 'Choose a rating from 1 to 5.');
    }

    const rawDescription = body.description;
    if (typeof rawDescription !== 'string') {
        return fail(res, 400, 'A description is required.');
    }
    if (Array.from(rawDescription).length > MAX_DESCRIPTION_LENGTH) {
        return fail(res, 400, 'The description cannot exceed 1,000 characters.');
    }
    const description = rawDescription.trim();
    if (!description) return fail(res, 400, 'A description is required.');

    try {
        const admin = adminClient();
        const auth = await authenticate(req, admin);
        if (auth.unauthorized || !auth.user?.id) {
            return fail(res, 401, 'Your session could not be verified. Sign in again and retry.');
        }

        // Derive StudentId from the verified Auth UID; never trust browser input.
        const { data: student, error: studentError } = await admin
            .from('Students')
            .select('StudentId')
            .eq('auth_uid', auth.user.id)
            .eq('role', 'student')
            .maybeSingle();
        if (studentError) throw studentError;
        if (!student?.StudentId) {
            return fail(res, 403, 'A student profile is required to send feedback.');
        }

        // FeedbackId and moderation flags are omitted: Postgres owns the identity
        // value and the existing false defaults.
        const { data: inserted, error: insertError } = await admin
            .from('Feedbacks')
            .insert({
                Description: description,
                Type: type,
                Rating: rating,
                StudentId: student.StudentId,
            })
            .select('FeedbackId')
            .single();
        if (insertError) throw insertError;
        if (!inserted?.FeedbackId) throw new Error('Feedback insert returned no identifier.');

        return res.status(201).json({ success: true, feedbackId: inserted.FeedbackId });
    } catch (error) {
        console.error('[feedback] request failed:', error);
        return fail(res, 503, 'We could not save your feedback right now. Please try again.');
    }
}
