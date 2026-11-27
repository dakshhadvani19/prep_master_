import {
    serviceClient,
    setPrivateHeaders,
    fail,
    authenticateStudent,
} from './_lib/razorpay-subscriptions.js';

function toUtcDate(value) {
    if (!value) return NaN;
    const text = String(value);
    const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)
        ? text
        : text.replace(' ', 'T') + 'Z';
    return new Date(normalized).getTime();
}

function safeCount(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function validityDays(value, fallback) {
    const match = String(value ?? '').match(/(\d+)/);
    const parsed = match ? Number(match[1]) : 0;
    return Number.isSafeInteger(parsed) && parsed > 0
        ? parsed
        : Math.max(1, Math.ceil(fallback / 86400000));
}

export default async function handler(req, res) {
    setPrivateHeaders(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET, OPTIONS');
        return fail(res, 405, 'This request method is not supported.');
    }

    try {
        const admin = serviceClient();
        const auth = await authenticateStudent(req, admin);
        if (auth.error) return fail(res, auth.error.status, auth.error.message);

        // Subscribers stores queued renewals separately. Only return the entitlement
        // whose start/end window contains the current server timestamp.
        const now = new Date();
        const nowForDb = now.toISOString().slice(0, 19).replace('T', ' ');
        const { data: activeRows, error: subscriberError } = await admin
            .from('Subscribers')
            .select('SubscriberId,StartDate,EndDate,SubscriptionId,RemainingTokens')
            .eq('StudentId', auth.student.StudentId)
            .lte('StartDate', nowForDb)
            .gt('EndDate', nowForDb)
            .order('StartDate', { ascending: false })
            .limit(1);
        if (subscriberError) throw subscriberError;

        const active = Array.isArray(activeRows) ? activeRows[0] : null;
        if (!active) return res.status(200).json({ subscription: null });

        let plan = null;
        if (active.SubscriptionId !== null && active.SubscriptionId !== undefined) {
            const { data, error } = await admin
                .from('Subscriptions')
                .select('SubscriptionId,Amount,Tokens,TimeValidity')
                .eq('SubscriptionId', active.SubscriptionId)
                .maybeSingle();
            if (error) throw error;
            plan = data || null;
        }

        const startMs = toUtcDate(active.StartDate);
        const endMs = toUtcDate(active.EndDate);
        const durationMs = Number.isFinite(startMs) && Number.isFinite(endMs)
            ? Math.max(0, endMs - startMs)
            : 0;
        const days = validityDays(plan?.TimeValidity, durationMs);
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
        const title = kind === 'weekly' ? 'Weekly' : kind === 'monthly' ? 'Monthly' : 'Custom';
        const totalCandidate = Number(plan?.Tokens);
        const totalTokens = Number.isSafeInteger(totalCandidate) && totalCandidate > 0
            ? totalCandidate
            : null;

        return res.status(200).json({
            subscription: {
                kind,
                title,
                validityDays: days,
                daysRemaining,
                remainingTokens: safeCount(active.RemainingTokens),
                totalTokens,
                startDate: active.StartDate,
                endDate: active.EndDate,
            },
        });
    } catch (error) {
        console.error('[student-subscription] request failed:', error);
        return fail(res, 503, 'Current subscription details could not be loaded. Please retry.');
    }
}
