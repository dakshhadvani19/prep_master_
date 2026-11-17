import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock3, CreditCard, LockKeyhole, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import './Subscriptions.css';
const PLANS=[
{planKind:'weekly',title:'Weekly',price:39,days:7,duration:'7 days',description:'A simple short-term pass for focused preparation.'},
{planKind:'monthly',title:'Monthly',price:149,days:30,duration:'30 days',description:'Extended access for consistent preparation.'},
];
let checkoutPromise;
function loadRazorpayCheckout(){
if(window.Razorpay)return Promise.resolve();
if(checkoutPromise)return checkoutPromise;
checkoutPromise=new Promise((resolve,reject)=>{
const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;
script.onload=resolve;script.onerror=()=>{checkoutPromise=null;reject(new Error('Razorpay Checkout could not be loaded. Check your connection and retry.'));};
document.body.appendChild(script);
});return checkoutPromise;
}
function newRequestId(){
if(globalThis.crypto&&globalThis.crypto.randomUUID)return globalThis.crypto.randomUUID();
const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
async function requestApi(url,token,options={}){
const response=await fetch(url,{...options,cache:'no-store',headers:{
...(options.body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(options.headers||{}),
}});
const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||'The request could not be completed.');return payload;
}
export default function Subscriptions(){
const navigate=useNavigate();const {currentUser,studentData}=useAuth();
const [catalogue,setCatalogue]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState(null);
const loadPlans=useCallback(async()=>{setLoading(true);try{setCatalogue(await requestApi('/api/subscription-plans'));}catch(error){setMessage({type:'error',text:error.message});}finally{setLoading(false);}},[]);
useEffect(()=>{loadPlans();},[loadPlans]);
const plans=useMemo(()=>PLANS.map(plan=>{const found=catalogue&&catalogue.plans?catalogue.plans.find(item=>item.planKind===plan.planKind):null;
return {...plan,tokens:found?found.tokens:null,checkoutEnabled:Boolean(found&&found.checkoutEnabled)};}),[catalogue]);
const checkActivation=async(transactionId,token)=>{
for(let i=0;i<12;i++){await new Promise(resolve=>window.setTimeout(resolve,2500));
const status=await requestApi('/api/subscription-status?transactionId='+encodeURIComponent(transactionId),token);
if(status.activated)return status;if(['failed','cancelled','expired','refunded'].includes(status.status))throw new Error('The payment did not complete. Your subscription has not been activated.');}
return null;
};
const startCheckout=async plan=>{
if(busy||!plan.checkoutEnabled)return;setMessage(null);
if(!currentUser){navigate('/signup?mode=login',{state:{from:'/subscriptions'}});return;}
if(!studentData||!studentData.studentId){setMessage({type:'error',text:'A student profile is required before checkout can start.'});return;}
setBusy(true);
try{
const sessionResult=await supabase.auth.getSession(),session=sessionResult&&sessionResult.data&&sessionResult.data.session;
if(!session||!session.access_token){navigate('/signup?mode=login',{state:{from:'/subscriptions'}});return;}
const token=session.access_token;
const order=await requestApi('/api/razorpay-create-order',token,{method:'POST',body:JSON.stringify({planKind:plan.planKind,idempotencyKey:newRequestId()})});
await loadRazorpayCheckout();
const checkout=new window.Razorpay({
key:order.keyId,amount:order.amountPaise,currency:order.currency,name:'PrepMaster',
description:plan.title+' subscription · '+plan.duration,order_id:order.orderId,
prefill:{name:studentData.fullName||currentUser.displayName||'',email:currentUser.email||''},
theme:{color:'#d6ad61'},
handler:async response=>{
setMessage({type:'pending',text:'Payment response received. Verifying with Razorpay…'});
try{
const verification=await requestApi('/api/razorpay-verify-payment',token,{method:'POST',body:JSON.stringify({
transactionId:order.transactionId,razorpay_payment_id:response.razorpay_payment_id,razorpay_signature:response.razorpay_signature,
})});
if(verification.status==='activated')setMessage({type:'success',text:verification.queued?'Payment captured. Your renewal is queued after your current subscription.':'Payment captured. Your subscription is active.'});
else{setMessage({type:'pending',text:'Payment is awaiting capture confirmation. Checking its status…'});
const status=await checkActivation(order.transactionId,token);
setMessage(status&&status.activated?{type:'success',text:'Payment captured. Your subscription is active or queued.'}:{type:'pending',text:'Confirmation is still pending. Refresh this page shortly to check again.'});}
}catch(error){setMessage({type:'error',text:error.message||'Payment verification is pending. Please check again shortly.'});}
finally{setBusy(false);}
},
modal:{ondismiss:()=>{setBusy(false);setMessage({type:'pending',text:'Checkout was closed. Any completed payment will still be checked by the server.'});}},
});
checkout.on('payment.failed',event=>{setBusy(false);setMessage({type:'error',text:event&&event.error&&event.error.description?event.error.description:'Payment failed. You can retry checkout.'});});
checkout.open();
}catch(error){setBusy(false);setMessage({type:'error',text:error.message||'Checkout could not be started.'});}
};
return <main className="subscriptions-page">
<header className="subscriptions-header">
<div className="subscriptions-eyebrow"><CreditCard size={15}/> STUDENT PLANS</div>
<h1>Choose your subscription</h1><p>Choose the access period that fits your preparation schedule.</p>
<div className="subscriptions-mode"><ShieldCheck size={15}/> Test Mode · Simulated payments only</div>
</header>
{message&&<div className={'subscriptions-message is-'+message.type} role="status">
{message.type==='success'?<CheckCircle2 size={18}/>:<Clock3 size={18}/>}<span>{message.text}</span>
<button type="button" onClick={()=>setMessage(null)} aria-label="Dismiss message">×</button></div>}
<section className="subscriptions-grid" aria-label="Subscription plans">
{plans.map(plan=><article className={'subscription-card subscription-card--'+plan.planKind} key={plan.planKind}>
<div className="subscription-card__top"><span className="subscription-card__eyebrow">{plan.planKind==='monthly'?'EXTENDED ACCESS':'FLEXIBLE ACCESS'}</span>
<span className="subscription-card__symbol">{plan.planKind==='monthly'?<Sparkles size={19}/>:<Clock3 size={19}/>}</span></div>
<h2>{plan.title}</h2><p className="subscription-card__description">{plan.description}</p>
<div className="subscription-card__price"><span>₹</span>{plan.price}<small> / {plan.duration}</small></div>
<div className="subscription-card__details"><div><CheckCircle2 size={16}/> {plan.days} days of validity</div>
<div><CreditCard size={16}/> {plan.tokens?plan.tokens+' tokens included':'Token allowance not configured'}</div></div>
<button type="button" className="subscription-card__button" disabled={loading||busy||!plan.checkoutEnabled} onClick={()=>startCheckout(plan)}>
{busy?'Opening checkout…':plan.checkoutEnabled?'Continue to payment':'Coming soon'}<ArrowRight size={16}/></button>
{!loading&&!plan.checkoutEnabled&&<p className="subscription-card__footnote">Checkout unlocks after the token allowance is configured.</p>}
{plan.checkoutEnabled&&<p className="subscription-card__footnote"><LockKeyhole size={13}/> Secure Razorpay Test Checkout</p>}
</article>)}
<article className="subscription-card subscription-card--custom">
<div className="subscription-card__top"><span className="subscription-card__eyebrow">MADE TO FIT</span><span className="subscription-card__symbol"><Sparkles size={19}/></span></div>
<h2>Custom</h2><p className="subscription-card__description">Set an amount and receive a matching token and validity plan.</p>
<label className="subscription-custom__label" htmlFor="custom-subscription-amount">Your amount (₹)</label>
<input id="custom-subscription-amount" className="subscription-custom__input" inputMode="decimal" type="number" min="1" step="1" placeholder="Enter an amount" disabled/>
<div className="subscription-card__details"><div><Clock3 size={16}/> Validity calculation pending</div><div><CreditCard size={16}/> Token calculation pending</div></div>
<button type="button" className="subscription-card__button" disabled>Custom plan unavailable <ArrowRight size={16}/></button>
<p className="subscription-card__footnote">Available after custom limits and calculation rules are approved.</p>
</article>
</section>
<footer className="subscriptions-footer">
<div><RefreshCw size={16}/> Renewals are queued after your current subscription ends.</div>
<p>Razorpay Test Mode only. No live payment is collected.</p>
<button type="button" onClick={loadPlans} disabled={loading||busy}><RefreshCw size={15} className={loading?'is-spinning':''}/> Refresh plan availability</button>
</footer>
</main>;
}
