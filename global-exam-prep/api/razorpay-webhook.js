import { Buffer } from 'node:buffer';
import { createHmac,timingSafeEqual } from 'node:crypto';
import { serviceClient,privatePaymentAction,getTestCredentials,envFirst,razorpayRequest } from './_lib/razorpay-subscriptions.js';
export const config={api:{bodyParser:false},maxDuration:20};
async function rawBodyOf(req){
if(Buffer.isBuffer(req.body))return req.body;
if(typeof req.body==='string')return Buffer.from(req.body,'utf8');
const chunks=[];for await(const chunk of req)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
return Buffer.concat(chunks);
}
function safeSignatureMatch(rawBody,signature,secret){
if(!/^[0-9a-f]{64}$/i.test(String(signature||'')))return false;
const expected=createHmac('sha256',secret).update(rawBody).digest(),received=Buffer.from(signature,'hex');
return received.length===expected.length&&timingSafeEqual(received,expected);
}
function eventEntities(payload){
const payment=payload?.payment?.entity||null,order=payload?.order?.entity||null;
return {payment,order,orderId:payment?.order_id||order?.id||null,paymentId:payment?.id||null};
}
async function activateCaptured(admin,credentials,orderId,paymentId){
const transaction=await privatePaymentAction(admin,'get_transaction',{razorpay_order_id:orderId});
if(!transaction?.transaction_id)return {ignored:true};
if(transaction.payment_status==='activated')return {activated:true,alreadyActivated:true};
const payment=await razorpayRequest(credentials,'payments/'+encodeURIComponent(paymentId));
if(payment.status!=='captured'||payment.order_id!==transaction.razorpay_order_id||Number(payment.amount)!==Number(transaction.amount_paise)||payment.currency!=='INR')
throw new Error('Captured payment does not match the stored PrepMaster order.');
return privatePaymentAction(admin,'activate_transaction',{transaction_id:transaction.transaction_id,razorpay_payment_id:paymentId,signature_verified:true});
}
export default async function handler(req,res){
res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed.'});}
let eventId='',admin=null;
try{
const credentials=getTestCredentials(),webhookSecret=envFirst('RAZORPAY_WEBHOOK_SECRET');
if(!credentials||!webhookSecret)return res.status(503).json({error:'Razorpay Test Mode webhook is not configured.'});
const rawBody=await rawBodyOf(req);
if(!safeSignatureMatch(rawBody,req.headers['x-razorpay-signature'],webhookSecret))return res.status(400).json({error:'Webhook signature verification failed.'});
eventId=String(req.headers['x-razorpay-event-id']||'');
if(!eventId||eventId.length>255)return res.status(400).json({error:'Webhook event ID is missing.'});
const event=JSON.parse(rawBody.toString('utf8')),eventType=String(event.event||'');
if(!['payment.authorized','payment.captured','payment.failed','order.paid'].includes(eventType))return res.status(200).json({ok:true,ignored:true});
const {payment,order,orderId,paymentId}=eventEntities(event.payload||{});
if(!orderId)return res.status(200).json({ok:true,ignored:true});
admin=serviceClient();
const eventState=await privatePaymentAction(admin,'record_webhook',{event_id:eventId,event_type:eventType,razorpay_order_id:orderId,razorpay_payment_id:paymentId});
if(eventState?.duplicate)return res.status(200).json({ok:true,duplicate:true});
if(eventType==='payment.authorized'){
await privatePaymentAction(admin,'mark_authorized',{razorpay_order_id:orderId});
}else if(eventType==='payment.failed'){
await privatePaymentAction(admin,'mark_failed',{razorpay_order_id:orderId,failure_code:payment?.error_code||'',failure_description:payment?.error_description||''});
}else if(eventType==='payment.captured'){
if(!paymentId)throw new Error('Captured event is missing its payment identifier.');
const activated=await activateCaptured(admin,credentials,orderId,paymentId);
if(activated?.ignored){await privatePaymentAction(admin,'finish_webhook',{event_id:eventId,processing_status:'processed'});return res.status(200).json({ok:true,ignored:true});}
}else if(eventType==='order.paid'){
const payments=await razorpayRequest(credentials,'orders/'+encodeURIComponent(orderId)+'/payments');
const captured=(payments?.items||[]).find(item=>item.status==='captured');
if(captured?.id)await activateCaptured(admin,credentials,orderId,captured.id);
}
await privatePaymentAction(admin,'finish_webhook',{event_id:eventId,processing_status:'processed'});
return res.status(200).json({ok:true});
}catch(error){
console.error('[razorpay-webhook] processing failed:',error);
if(admin&&eventId){try{await privatePaymentAction(admin,'finish_webhook',{event_id:eventId,processing_status:'failed',last_error:String(error?.message||'Processing failed')});}catch(recordError){console.error('[razorpay-webhook] could not record retry state:',recordError);}}
return res.status(500).json({error:'Webhook processing failed. Razorpay may retry this event.'});
}
}
