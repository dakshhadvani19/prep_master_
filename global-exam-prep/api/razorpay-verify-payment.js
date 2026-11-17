import { Buffer } from 'node:buffer';
import { createHmac,timingSafeEqual } from 'node:crypto';
import { serviceClient,setPrivateHeaders,fail,bodyOf,isUuid,authenticateStudent,getTestCredentials,privatePaymentAction,razorpayRequest } from './_lib/razorpay-subscriptions.js';
function validHexSignature(received,expected){
if(!/^[0-9a-f]{64}$/i.test(String(received||'')))return false;
const left=Buffer.from(received,'hex'),right=Buffer.from(expected,'hex');
return left.length===right.length&&timingSafeEqual(left,right);
}
export default async function handler(req,res){
setPrivateHeaders(res);
if(req.method==='OPTIONS')return res.status(204).end();
if(req.method!=='POST'){res.setHeader('Allow','POST, OPTIONS');return fail(res,405,'This request method is not supported.');}
try{
const credentials=getTestCredentials();
if(!credentials)return fail(res,503,'Razorpay Test Mode is not configured for this deployment.');
const admin=serviceClient(),auth=await authenticateStudent(req,admin);
if(auth.error)return fail(res,auth.error.status,auth.error.message);
const body=bodyOf(req),transactionId=String(body.transactionId||''),paymentId=String(body.razorpay_payment_id||''),signature=String(body.razorpay_signature||'');
if(!isUuid(transactionId)||!paymentId||paymentId.length>100)return fail(res,400,'The payment response is incomplete. Please retry from Subscriptions.');
const transaction=await privatePaymentAction(admin,'get_transaction',{transaction_id:transactionId,student_id:auth.student.StudentId});
if(!transaction?.transaction_id||!transaction.razorpay_order_id)return fail(res,404,'The payment order could not be found for this student.');
if(transaction.payment_status==='activated'){
const {data:subscriber}=await admin.from('Subscribers').select('StartDate').eq('SubscriberId',transaction.subscriber_id).maybeSingle();
return res.status(200).json({status:'activated',alreadyActivated:true,queued:Boolean(subscriber?.StartDate&&new Date(subscriber.StartDate).getTime()>Date.now())});
}
const expected=createHmac('sha256',credentials.keySecret).update(transaction.razorpay_order_id+'|'+paymentId,'utf8').digest('hex');
if(!validHexSignature(signature,expected))return fail(res,400,'The payment signature could not be verified.');
const payment=await razorpayRequest(credentials,'payments/'+encodeURIComponent(paymentId));
if(payment.order_id!==transaction.razorpay_order_id||Number(payment.amount)!==Number(transaction.amount_paise)||payment.currency!=='INR')
return fail(res,400,'The payment details do not match this order.');
if(payment.status==='authorized'){
await privatePaymentAction(admin,'mark_authorized',{razorpay_order_id:transaction.razorpay_order_id});
return res.status(202).json({status:'pending',message:'Payment is authorized and awaiting capture confirmation.'});
}
if(payment.status!=='captured'){
if(payment.status==='failed')await privatePaymentAction(admin,'mark_failed',{razorpay_order_id:transaction.razorpay_order_id,failure_code:payment.error_code||'',failure_description:payment.error_description||''});
return res.status(202).json({status:'pending',message:'Payment has not been captured yet.'});
}
const activation=await privatePaymentAction(admin,'activate_transaction',{transaction_id:transactionId,razorpay_payment_id:paymentId,signature_verified:true});
if(!activation?.activated)throw new Error('The captured payment could not activate its subscription.');
return res.status(200).json({status:'activated',alreadyActivated:activation.already_activated===true,queued:activation.queued===true,startDate:activation.start_date||null,endDate:activation.end_date||null});
}catch(error){console.error('[razorpay-verify-payment] request failed:',error);return fail(res,503,'Payment verification could not be completed. Please refresh your subscription status or contact support.');}
}
