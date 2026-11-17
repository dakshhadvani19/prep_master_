import { serviceClient, setPrivateHeaders, fail, getTestCredentials, isWebhookConfigured, resolveFixedPlan, CUSTOM_PLAN_RULES } from './razorpay-subscriptions.js';

const PLAN_SPECS = [
    { planKind: 'weekly', title: 'Weekly', amountPaise: 3900, price: 39, validityDays: 7, validityLabel: '7 days' },
    { planKind: 'monthly', title: 'Monthly', amountPaise: 14900, price: 149, validityDays: 30, validityLabel: '30 days' },
];

export default async function subscriptionPlansHandler(req, res) {
    setPrivateHeaders(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET, OPTIONS');
        return fail(res, 405, 'This request method is not supported.');
    }
    try {
        const admin = serviceClient();
        const { data: rows, error } = await admin.from('Subscriptions').select('SubscriptionId,Amount,Tokens,TimeValidity');
        if (error) throw error;
        const checkoutConfigured = Boolean(getTestCredentials() && isWebhookConfigured());
        const plans = PLAN_SPECS.map(spec => {
            const result = resolveFixedPlan(rows, spec.planKind);
            return {
                ...spec,
                subscriptionId: result.ready ? result.subscriptionId : null,
                tokens: result.ready ? result.tokens : null,
                checkoutEnabled: checkoutConfigured && result.ready,
                setupStatus: !checkoutConfigured ? 'test_credentials_or_webhook_missing' : result.ready ? 'ready' : result.reason,
            };
        });
        return res.status(200).json({
            mode: 'test',
            checkoutConfigured,
            plans,
            custom: { enabled: checkoutConfigured, ...CUSTOM_PLAN_RULES },
            renewal: 'queued_after_latest_subscription',
        });
    } catch (error) {
        console.error('[subscription-plans] request failed:', error);
        return fail(res, 503, 'Subscription plans could not be loaded. Please retry.');
    }
}
