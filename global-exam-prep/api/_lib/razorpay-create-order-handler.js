import { randomUUID } from 'node:crypto';
import {
    serviceClient, setPrivateHeaders, fail, bodyOf, isUuid, authenticateStudent,
    getTestCredentials, isWebhookConfigured, resolveFixedPlan, resolveCustomPlan,
    privatePaymentAction, razorpayRequest,
} from './razorpay-subscriptions.js';

export default async function createOrderHandler(req, res) {
    setPrivateHeaders(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return fail(res, 405, 'This request method is not supported.');
    }
    try {
        const credentials = getTestCredentials();
        if (!credentials || !isWebhookConfigured()) {
            return fail(res, 503, 'Razorpay Test Mode credentials and webhook are required before checkout.');
        }
        const admin = serviceClient();
        const auth = await authenticateStudent(req, admin);
        if (auth.error) return fail(res, auth.error.status, auth.error.message);

        const body = bodyOf(req);
        const planKind = String(body.planKind || '');
        if (!['weekly', 'monthly', 'custom'].includes(planKind)) return fail(res, 400, 'Choose a valid subscription plan.');
        if (!isUuid(body.idempotencyKey)) return fail(res, 400, 'The purchase request is invalid. Refresh the page and try again.');

        let plan;
        let subscriptionId = null;
        if (planKind === 'custom') {
            plan = resolveCustomPlan(body.amountRupees);
            if (!plan.ready) return fail(res, 400, 'Enter a whole-rupee custom amount between ₹10 and ₹999.');
        } else {
            const { data: rows, error: planError } = await admin.from('Subscriptions').select('SubscriptionId,Amount,Tokens,TimeValidity');
            if (planError) throw planError;
            plan = resolveFixedPlan(rows, planKind);
            if (!plan.ready) return fail(res, 409, 'This fixed plan is not configured with its approved token allocation.');
            subscriptionId = plan.subscriptionId;
        }

        const transactionId = randomUUID();
        const receipt = 'pm_' + transactionId.replace(/-/g, '');
        const transaction = await privatePaymentAction(admin, 'create_transaction', {
            transaction_id: transactionId,
            idempotency_key: body.idempotencyKey,
            receipt,
            student_id: auth.student.StudentId,
            subscription_id: subscriptionId,
            plan_kind: planKind,
            amount_paise: plan.amountPaise,
            tokens_granted: plan.tokens,
            validity_seconds: plan.validitySeconds || plan.validityDays * 86400,
            validity_label: plan.validityLabel || plan.label,
            environment: 'test',
        });
        if (!transaction?.transaction_id) throw new Error('The pending payment record could not be created.');

        const effectiveTransactionId = transaction.transaction_id;
        if (transaction.razorpay_order_id) {
            return res.status(200).json({
                keyId: credentials.keyId,
                orderId: transaction.razorpay_order_id,
                transactionId: effectiveTransactionId,
                amountPaise: Number(transaction.amount_paise),
                currency: 'INR',
            });
        }

        const order = await razorpayRequest(credentials, 'orders', {
            method: 'POST',
            body: {
                amount: plan.amountPaise,
                currency: 'INR',
                receipt: transaction.receipt || receipt,
                notes: { prep_master_transaction_id: effectiveTransactionId, plan_kind: planKind },
            },
        });
        if (!order?.id || Number(order.amount) !== plan.amountPaise || order.currency !== 'INR') {
            throw new Error('Razorpay returned an invalid order response.');
        }
        await privatePaymentAction(admin, 'attach_order', {
            transaction_id: effectiveTransactionId,
            razorpay_order_id: order.id,
        });
        return res.status(201).json({
            keyId: credentials.keyId,
            orderId: order.id,
            transactionId: effectiveTransactionId,
            amountPaise: plan.amountPaise,
            currency: 'INR',
        });
    } catch (error) {
        console.error('[razorpay-create-order] request failed:', error);
        const status = Number(error?.status);
        return fail(
            res,
            status >= 400 && status < 500 ? status : 503,
            status >= 400 && status < 500
                ? 'Razorpay could not create this order. Please retry.'
                : 'Checkout could not be started. Please retry.'
        );
    }
}
