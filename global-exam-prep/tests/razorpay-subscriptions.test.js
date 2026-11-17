import { describe, expect, it } from 'vitest';
import { parseAmountPaise, parseValidityDays, resolveFixedPlan } from '../api/_lib/razorpay-subscriptions.js';
describe('Razorpay subscription catalogue resolution',()=>{
it('parses rupee amounts as paise without floating point rounding',()=>{
expect(parseAmountPaise('₹39')).toBe(3900);expect(parseAmountPaise('149.00')).toBe(14900);expect(parseAmountPaise('INR 39')).toBe(3900);expect(parseAmountPaise('39.999')).toBeNull();
});
it('accepts day-based validity labels only',()=>{
expect(parseValidityDays('7 days')).toBe(7);expect(parseValidityDays('30 Days')).toBe(30);expect(parseValidityDays('1 month')).toBeNull();
});
it('requires exactly one row and a positive token grant for each fixed plan',()=>{
const rows=[{SubscriptionId:11,Amount:'39',Tokens:500,TimeValidity:'7 days'},{SubscriptionId:12,Amount:'149',Tokens:2500,TimeValidity:'30 days'}];
expect(resolveFixedPlan(rows,'weekly')).toMatchObject({ready:true,subscriptionId:'11',amountPaise:3900,validityDays:7,tokens:'500'});
expect(resolveFixedPlan(rows,'monthly')).toMatchObject({ready:true,subscriptionId:'12'});
expect(resolveFixedPlan([],'weekly')).toMatchObject({ready:false,reason:'plan_not_configured'});
expect(resolveFixedPlan([{...rows[0],Tokens:0}],'weekly')).toMatchObject({ready:false,reason:'tokens_not_configured'});
expect(resolveFixedPlan([rows[0],{...rows[0],SubscriptionId:13}],'weekly')).toMatchObject({ready:false,reason:'ambiguous_catalogue'});
});
});
