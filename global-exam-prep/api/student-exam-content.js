import { createClient } from '@supabase/supabase-js';

const process = globalThis.process;

function envFirst(...names) {
    for (const name of names) if (process.env[name]?.trim()) return process.env[name].trim();
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

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

    try {
        const subjectId = Number(new URL(req.url, 'http://localhost').searchParams.get('subjectId'));
        if (!Number.isSafeInteger(subjectId) || subjectId <= 0) {
            return res.status(400).json({ error: 'A valid subject identifier is required.' });
        }
        const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
        if (!token) return res.status(401).js¶»§q«^