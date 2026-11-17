import { serviceClient,setPrivateHeaders,fail,authenticateStudent,privatePaymentAction,isUuid } from './_lib/razorpay-subscriptions.js';
export default async function handler(req,res){
setPrivateHeaders(res);
if(req.method==='OPTIONS')return res.status(204).end();
if(req.method!=='GET'){res.setHeader('Allow','GET, OPTIONS');return fail(res,405,'This request method is not supported.');}
try{
const admin=serviceClient(),auth=await authenticateStudent(req,admin);
if(auth.error)return fail(res,auth.error.status,auth.error.message);
const transactionId=String(req.query?.transactionId||'');
if(!isUuid(transactionId))return fail(res,400,'A valid transaction ID is required.');
const transaction=await privatePaymentAction(admin,'get_transaction',{transaction_id:transactionId,student_id:auth.student.StudentId});
if(!transaction?.transaction_id)return fail(res,404,'The payment transaction was not found.');
return res.status(200).json({status:transaction.payment_status,activated:transaction.payment_status==='activated',
subscriberId:transaction.subscriber_id||null,createdAt:transaction.created_at,activatedAt:transaction.activated_at});
}catch(error){console.error('[subscription-status] request failed:',error);return fail(res,503,'Subscription status could not be loaded. Please retry.');}
}
