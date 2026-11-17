import { Buffer } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';

const process = globalThis.process;

export function envFirst(...names) {
    for (const name of names) if (process.env[name]?.trim()) return process.env[name].trim();
    return '';
}

export function serviceClient() {
    const url = envFirst('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/+$/, '');
    let key = envFirst('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
    if (!key) {
        try { key = JSON.parse(process.env.SUPABASE_SECRET_KEYS || '{}').default || ''; } catch { key = ''; }
    }
    if (!url || !key) throw new Error('Supabase server credentials are not configured.');
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

export function setPrivateHeaders(res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');
}
export function fail(res, status, message) { return res.status(status).json({ error: message }); }
export function bodyOf(req) {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
    return {};
}
export function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}
export async function authenticateStudent(req, admin) {
    const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return { error: { status: 401, message: 'Sign in before purchasing a subscription.' } };
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authError ? null : authData?.user;
    if (!user?.id) return { error: { status: 401, message: 'Your session has expired. Sign in and try again.' } };
    const { data: student, error } = await admin.from('Students')
        .select('StudentId,FullName,Email,IsSpam,role').eq('auth_uid', user.id).eq('role', 'student').maybeSingle();
    if (error) throw error;
    if (!student) return { error: { status: 403, message: 'A student profile is required to purchase a subscription.' } };
    if (student.IsSpam) return { error: { status: 403, message: 'This account cannot purchase subscriptions. Contact PrepMaster support.' } };
    return { user, student };
}
export function getTestCredentials() {
    const mode = envFirst('RAZORPAY_MODE').toLowerCase();
    const keyId = envFirst('RAZORPAY_KEY_ID');
    const keySecret = envFirst('RAZORPAY_KEY_SECRET');
    if (mode !== 'test' || !keyId.startsWith('rzp_test_') || !keySecret) return null;
    return { mode: 'test', keyId, keySecret };
}
export function isWebhookConfigured() { return Boolean(envFirst('RAZORPAY_WEBHOOK_SECRET')); }
export async function privatePaymentAction(admin, action, payload = {}) {
    const { data, error } = await admin.rpc('pm_subscription_payment_action', { p_action: action, p_payload: payload });
    if (error) throw new Error(error.message || 'The payment record could not be updated.');
    return data;
}
export function parseAmountPaise(value) {
    const normalized = String(value ?? '').trim().replace(/^INR\s*/i, '').replace(/[₹,\s]/g, '');
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
    const [whole, fraction = ''] = normalized.split('.');
    const paise = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
    return paise <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(paise) : null;
}
export function parseValidityDays(value) {
    const match = String(value ?? '').trim().match(/^(\d+)\s*(?:day|days|d)$/i);
    if (!match) return null;
    const days = Number(match[1]);
    return Number.isSafeInteger(days) && days > 0 ? days : null;
}
export function resolveFixedPlan(rows, planKind) {
    const spec = planKind === 'weekly'
        ? { amountPaise: 3900, validityDays: 7, label: '7 days', expectedTokens: 1000 }
        : planKind === 'monthly'
            ? { amountPaise: 14900, validityDays: 30, label: '30 days', expectedTokens: 4000 }
            : null;
    if (!spec) return { ready: false, reason: 'unsupported_plan' };
    const matches = (rows || []).filter(row => parseAmountPaise(row.Amount) === spec.amountPaise
        && parseValidityDays(row.TimeValidity) === spec.validityDays);
    if (matches.length !== 1) {
        return { ready: false, reason: matches.length > 1 ? 'ambiguous_catalogue' : 'plan_not_configured', ...spec };
    }
    const row = matches[0], tokens = String(row.Tokens ?? '');
    if (!/^[1-9]\d*$/.test(tokens) || Number(tokens) !== spec.expectedTokens) {
        return { ready: false, reason: 'token_allocation_mismatch', ...spec };
    }
    return { ready: true, subscriptionId: String(row.SubscriptionId), tokens: Number(tokens), ...spec };
}
export const CUSTOM_PLAN_RULES = Object.freeze({
    minimumAmountRupees: 10,
    maximumAmountRupees: 999,
    weeklyPriceRupees: 39,
    weeklyValidityDays: 7,
    weeklyTokens: 1000,
    validityRounding: 'nearest_whole_day',
    tokenRounding: 'floor',
});
export function resolveCustomPlan(amountValue) {
    const raw = String(amountValue ?? '').trim();
    if (!/^\d+$/.test(raw)) return { ready: false, reason: 'whole_rupee_amount_required' };
    const amountRupees = Number(raw);
    if (!Number.isSafeInteger(amountRupees) || amountRupees < 10 || amountRupees > 999) {
        return { ready: false, reason: 'amount_out_of_range' };
    }
    const tokens = Math.floor(amountRupees * 1000 / 39);
    const validityDays = Math.max(1, Math.round(amountRupees * 7 / 39));
    return {
        ready: true, amountRupees, amountPaise: amountRupees * 100, tokens,
        validityDays, validitySeconds: validityDays * 86400, validityLabel: validityDays + ' days',
    };
}
export async function razorpayRequest(credentials, path, { method = 'GET', body } = {}) {
    const auth = Buffer.from(credentials.keyId + ':' + credentials.keySecret, 'utf8').toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/' + path.replace(/^\/+/, ''), {
        method,
        headers: { Authorization: 'Basic ' + auth, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15000),
    });
    let payload = {};
    try { payload = await response.json(); } catch { /* handled below */ }
    if (!response.ok) {
        const error = new Error(payload?.error?.description || 'Razorpay could not complete the request.');
        error.status = response.status;
        error.providerCode = payload?.error?.code || null;
        throw error;
    }
    return payload;
}
