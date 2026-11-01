import { createClient } from '@supabase/supabase-js';

const process = globalThis.process;

function envFirst(...names) {
    for (const name of names) {
        if (process.env[name]?.trim()) return process.env[name].trim();
    }
    return '';
}

function serviceClient() {
    const url = envFirst('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/+$/, '');
    let key = envFirst('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
    if (!key) {
        try { key = JSON.parse(process.env.SUPABASE_SECRET_KEYS || '{}').default || ''; } catch { key = ''; }
    }
    if (!url || !key) throw new Error('Supabase server credentials are not configured.');
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

function fail(res, status, message, extra = {}) {
    return res.status(status).json({ error: message, ...extra });
}

function integer(value, label, allowZero = false) {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < (allowZero ? 0 : 1)) throw new Error(label + ' is invalid.');
    return n;
}

function subjectName(value) {
    const name = String(value || '').replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 180) throw new Error('Subject name must contain 2â€“180 characters.');
    return name;
}

async function authenticateAdmin(req, client) {
    const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return { error¶»§q«^