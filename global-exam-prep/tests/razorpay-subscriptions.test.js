import { describe, expect, it } from 'vitest';
import { parseAmountPaise, parseValidityDays, resolveFixedPlan, resolveCustomPlan } from '../api/_lib/razorpay-subscriptions.js';

describe('Razorpay subscription catalogue resolution', () => {
    it('parses rupee amounts into paise without floating point rounding', () => {
        expect(parseAmountPaise('₹39')).toBe(3900);
        expect(parseAmountPaise('149.00')).toBe(14900);
        expect(parseAmountPaise('INR 39')).toBe(3900);
        expect(parseAmountPaise('39.999')).toBeNull();
    });
    it('accepts day-based validity labels only', () => {
        expect(parseValidityDays('7 days')).toBe(7);
        expect(parseValidityDays('30 Days')).toBe(30);
        expect(parseValidityDays('1 month')).toBeNull();
    });
    it('requires fixed catalogue rows with the approved token allocations', () => {
        const rows = [
            { SubscriptionId: 1, Amount: '39', Tokens: 1000, TimeValidity: '7 days' },
            { SubscriptionId: 2, Amount: '149', Tokens: 4000, TimeValidity: '30 days' },
        ];
        expect(resolveFixedPlan(rows, 'weekly')).toMatchObject({ ready: true, subscriptionId: '1', tokens: 1000 });
        expect(resolveFixedPlan(rows, 'monthly')).toMatchObject({ ready: true, subscriptionId: '2', tokens: 4000 });
        expect(resolveFixedPlan([], 'weekly')).toMatchObject({ ready: false, reason: 'plan_not_configured' });
        expect(resolveFixedPlan([{ ...rows[0], Tokens: 999 }], 'weekly')).toMatchObject({ ready: false, reason: 'token_allocation_mismatch' });
        expect(resolveFixedPlan([rows[0], { ...rows[0], SubscriptionId: 3 }], 'weekly')).toMatchObject({ ready: false, reason: 'ambiguous_catalogue' });
    });
});

describe('Custom subscription calculation', () => {
    it('uses the weekly rate and rounds tokens down and validity to the nearest day', () => {
        expect(resolveCustomPlan(10)).toMatchObject({ ready: true, amountPaise: 1000, tokens: 256, validityDays: 2, validitySeconds: 172800 });
        expect(resolveCustomPlan(39)).toMatchObject({ ready: true, tokens: 1000, validityDays: 7 });
        expect(resolveCustomPlan(149)).toMatchObject({ ready: true, tokens: 3820, validityDays: 27 });
        expect(resolveCustomPlan(999)).toMatchObject({ ready: true, tokens: 25615, validityDays: 179 });
    });
    it('rejects decimals and amounts outside the ₹10–₹999 range', () => {
        expect(resolveCustomPlan(9)).toMatchObject({ ready: false, reason: 'amount_out_of_range' });
        expect(resolveCustomPlan(1000)).toMatchObject({ ready: false, reason: 'amount_out_of_range' });
        expect(resolveCustomPlan('10.5')).toMatchObject({ ready: false, reason: 'whole_rupee_amount_required' });
        expect(resolveCustomPlan('')).toMatchObject({ ready: false, reason: 'whole_rupee_amount_required' });
    });
});
