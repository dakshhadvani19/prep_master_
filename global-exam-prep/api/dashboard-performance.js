import { createClient } from '@supabase/supabase-js';
import subscriptionPlansHandler from './_lib/razorpay-plans-handler.js';
import createOrderHandler from './_lib/razorpay-create-order-handler.js';
import verifyPaymentHandler from './_lib/razorpay-verify-payment-handler.js';
import subscriptionStatusHandler from './_lib/razorpay-subscription-status-handler.js';

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


function parseUtcDate(value) {
    if (!value) return NaN;
    const text = String(value);
    const normalized = /(?:Z|[+-]\\d{2}:?\\d{2})$/i.test(text)
        ? text
        : text.replace(' ', 'T') + 'Z';
    return new Date(normalized).getTime();
}

function safeCount(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function parseValidityDays(value, fallbackMs) {
    const match = String(value ?? '').match(/(\\d+)/);
    const parsed = match ? Number(match[1]) : 0;
    return Number.isSafeInteger(parsed) && parsed > 0
        ? parsed
        : Math.max(1, Math.ceil(fallbackMs / 86400000));
}

async function loadCurrentSubscription(admin, studentId) {
    const now = new Date();
    const nowForDb = now.toISOString().slice(0, 19).replace('T', ' ');
    const { data: rows, error } = await admin
        .from('Subscribers')
        .select('SubscriberId,StartDate,EndDate,SubscriptionId,RemainingTokens')
        .eq('StudentId', studentId)
        .lte('StartDate', nowForDb)
        .gt('EndDate', nowForDb)
        .order('StartDate', { ascending: false })
        .limit(1);
    if (error) throw error;

    const active = Array.isArray(rows) ? rows[0] : null;
    if (!active) return null;

    let plan = null;
    if (active.SubscriptionId !== null && active.SubscriptionId !== undefined) {
        const { data, error: planError } = await admin
            .from('Subscriptions')
            .select('SubscriptionId,Amount,Tokens,TimeValidity')
            .eq('SubscriptionId', active.SubscriptionId)
            .maybeSingle();
        if (planError) throw planError;
        plan = data || null;
    }

    const startMs = parseUtcDate(active.StartDate);
    const endMs = parseUtcDate(active.EndDate);
    const durationMs = Number.isFinite(startMs) && Number.isFinite(endMs)
        ? Math.max(0, endMs - startMs)
        : 0;
    const days = parseValidityDays(plan?.TimeValidity, durationMs);
    const daysRemaining = Number.isFinite(endMs)
        ? Math.max(0, Math.ceil((endMs - now.getTime()) / 86400000))
        : 0;
    const amount = Number(String(plan?.Amount ?? '').replace(/[^0-9.]/g, ''));
    const kind = active.SubscriptionId == null
        ? 'custom'
        : days === 7 || amount === 39
            ? 'weekly'
            : days === 30 || amount === 149
                ? 'monthly'
                : 'custom';
    const totalCandidate = Number(plan?.Tokens);
    const totalTokens = Number.isSafeInteger(totalCandidate) && totalCandidate > 0
        ? totalCandidate
        : null;

    return {
        kind,
        title: kind === 'weekly' ? 'Weekly' : kind === 'monthly' ? 'Monthly' : 'Custom',
        validityDays: days,
        daysRemaining,
        remainingTokens: safeCount(active.RemainingTokens),
        totalTokens,
        startDate: active.StartDate,
        endDate: active.EndDate,
    };
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

export const config = { maxDuration: 20 };

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const paymentAction = String(req.query?.razorpayAction || '');
    const paymentHandlers = {
        plans: subscriptionPlansHandler,
        createOrder: createOrderHandler,
        verifyPayment: verifyPaymentHandler,
        status: subscriptionStatusHandler,
    };
    if (paymentAction) {
        const paymentHandler = paymentHandlers[paymentAction];
        if (!paymentHandler) return respond(res, 404, 'This payment endpoint does not exist.');
        return paymentHandler(req, res);
    }

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

        let subscription = null;
        let subscriptionError = null;
        try {
            subscription = await loadCurrentSubscription(admin, student.StudentId);
        } catch (subscriptionLookupError) {
            console.error('[dashboard-performance] subscription lookup failed:', subscriptionLookupError);
            subscriptionError = 'Current subscription details could not be loaded. Please retry.';
        }

        return res.status(200).json({ performance: data, subscription, subscriptionError });
    } catch (error) {
        // Preserve real Supabase/Postgres details in server logs only.
        console.error('[dashboard-performance] request failed:', error);
        return respond(res, 503, 'We could not load your performance summary right now. Please try again.');
    }
}
