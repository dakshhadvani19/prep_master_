import { randomUUID } from 'node:crypto';
import { serviceClient,setPrivateHeaders,fail,bodyOf,isUuid,authenticateStudent,getTestCredentials,resolveFixedPlan,privatePaymentAction,razorpayRequest } from './_lib/razorpay-subscriptions.js';
export const config={maxDuration:20};
export default async function handler(req,res){
setPrivateHeaders(res);
if(req.method==='OPTIONS')return res.status(204).end();
if(req.method!=='POST'){res.setHeader('Allow','POST, OPTIONS');return fail(res,405,'This request method is not supported.');}
try{
const credentials=getTestCredentials();
if(!credentials)return fail(res,503,'Razorpay Test Mode is not configured for this deployment.');
const admin=serviceClient(),auth=await authenticateStudent(req,admin);
if(auth.error)return fail(res,auth.error.status,auth.error.message);
const body=bodyOf(req),planKind=String(body.planKind||'');
if(!['weekly','monthly'].includes(planKind))return fail(res,400,'Choose a configured weekly or monthly plan. Custom purchases are not enabled yet.');
if(!isUuid(body.idempotencyKey))return fail(res,400,'The purchase request is invalid. Refresh the page and try again.');
const {data:rows,error:planError}=await admin.from('Subscriptions').select('SubscriptionId,Amount,Tokens,TimeValidity');
if(planError)throw planError;
const plan=resolveFixedPlan(rows,planKind);
if(!plan.ready)return fail(res,409,'This plan is not ready for checkout because its token allowance has not been configured.');
const transactionId=randomUUID(),receipt='pm_'+transactionId.replace(/-/g,'');
const transaction=await privatePaymentAction(admin,'create_transaction',{
transaction_id:transactionId,idempotency_key:body.idempotencyKey,receipt,student_id:auth.student.StudentId,
subscription_id:plan.subscriptionId,plan_kind:planKind,amount_paise:plan.amountPaise,tokens_granted:plan.tokens,
validity_seconds:plan.validityDays*86400,validity_label:plan.label,environment:'test',
});
if(!transaction?.transaction_id)throw new Error('The pending payment record could not be created.');
const effectiveTransactionId=transaction.transaction_id;
if(transaction.razorpay_order_id)return res.status(200).json({
keyId:credentials.keyId,orderId:transaction.razorpay_order_id,transactionId:effectiveTransactionId,
amountPaise:Number(transaction.amount_paise),currency:'INR',
});
const order=await razorpayRequest(credentials,'orders',{method:'POST',body:{
amount:plan.amountPaise,currency:'INR',receipt:transaction.receipt||receipt,
notes:{prep_master_transaction_id:effectiveTransactionId,plan_kind:planKind},
}});
if(!order?.id||Number(order.amount)!==plan.amountPaise||order.currency!=='INR')throw new Error('Razorpay returned an invalid order response.');
await privatePaymentAction(admin,'attach_order',{transaction_id:effectiveTransactionId,razorpay_order_id:order.id});
return res.status(201).json({keyId:credentials.keyId,orderId:order.id,transactionId:effectiveTransactionId,amountPaise:plan.amountPaise,currency:'INR'});
}catch(error){
console.error('[razorpay-create-order] request failed:',error);
const status=Number(error?.status);
return fail(res,status>=400&&status<500?status:503,status>=400&&status<500?'Razorpay could not create this order. Please retry.':'Checkout could not be started. Please retry.');
}
}
