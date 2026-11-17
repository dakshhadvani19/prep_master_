-- Fix webhook insert RETURNING target type and recover stale in-flight webhook events.
CREATE OR REPLACE FUNCTION public.pm_subscription_payment_action(p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $function$
DECLARE
v_tx private.payment_transactions%ROWTYPE;v_event private.razorpay_webhook_events%ROWTYPE;v_inserted_event text;
v_transaction_id uuid;v_idempotency_key uuid;v_amount_paise bigint;v_tokens bigint;v_validity_seconds bigint;
v_student_id bigint;v_subscription_id bigint;v_subscriber_id bigint;v_payment_id text;
v_now_utc timestamp without time zone:=timezone('UTC',now());v_start timestamp without time zone;v_end timestamp without time zone;
v_latest_end timestamp without time zone;v_amount_text text;v_validity_days bigint;
BEGIN
IF COALESCE(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'Service role access required' USING ERRCODE='42501'; END IF;
IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'Payload must be a JSON object'; END IF;
CASE p_action
WHEN 'create_transaction' THEN
v_transaction_id:=(p_payload->>'transaction_id')::uuid;v_idempotency_key:=(p_payload->>'idempotency_key')::uuid;v_student_id:=(p_payload->>'student_id')::bigint;
v_subscription_id:=(p_payload->>'subscription_id')::bigint;v_amount_paise:=(p_payload->>'amount_paise')::bigint;v_tokens:=(p_payload->>'tokens_granted')::bigint;
v_validity_seconds:=(p_payload->>'validity_seconds')::bigint;
IF v_transaction_id IS NULL OR v_idempotency_key IS NULL OR v_student_id IS NULL OR v_subscription_id IS NULL OR COALESCE(v_amount_paise,0)<=0
OR COALESCE(v_tokens,0)<=0 OR COALESCE(v_validity_seconds,0)<=0 OR p_payload->>'plan_kind' NOT IN ('weekly','monthly') OR p_payload->>'environment'<>'test'
THEN RAISE EXCEPTION 'Invalid or unsupported payment transaction';END IF;
INSERT INTO private.payment_transactions(transaction_id,student_id,subscription_id,plan_kind,amount_paise,currency,tokens_granted,validity_seconds,
validity_label,environment,idempotency_key,receipt,payment_status,created_at,updated_at)
VALUES(v_transaction_id,v_student_id,v_subscription_id,p_payload->>'plan_kind',v_amount_paise,'INR',v_tokens,v_validity_seconds,
left(btrim(p_payload->>'validity_label'),30),'test',v_idempotency_key,left(btrim(p_payload->>'receipt'),40),'order_pending',now(),now())
ON CONFLICT(idempotency_key) DO NOTHING RETURNING * INTO v_tx;
IF NOT FOUND THEN SELECT * INTO v_tx FROM private.payment_transactions WHERE idempotency_key=v_idempotency_key FOR UPDATE;
IF NOT FOUND OR v_tx.student_id<>v_student_id OR v_tx.subscription_id<>v_subscription_id OR v_tx.amount_paise<>v_amount_paise
OR v_tx.tokens_granted<>v_tokens OR v_tx.validity_seconds<>v_validity_seconds OR v_tx.plan_kind<>p_payload->>'plan_kind'
THEN RAISE EXCEPTION 'Idempotency key was already used for a different purchase';END IF;END IF;RETURN to_jsonb(v_tx);
WHEN 'get_transaction' THEN
IF NULLIF(p_payload->>'transaction_id','') IS NOT NULL THEN SELECT * INTO v_tx FROM private.payment_transactions WHERE transaction_id=(p_payload->>'transaction_id')::uuid
AND (NULLIF(p_payload->>'student_id','') IS NULL OR student_id=(p_payload->>'student_id')::bigint) LIMIT 1;
ELSIF NULLIF(p_payload->>'razorpay_order_id','') IS NOT NULL THEN SELECT * INTO v_tx FROM private.payment_transactions WHERE razorpay_order_id=p_payload->>'razorpay_order_id' LIMIT 1;END IF;
RETURN CASE WHEN v_tx.transaction_id IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_tx) END;
WHEN 'attach_order' THEN
UPDATE private.payment_transactions SET razorpay_order_id=p_payload->>'razorpay_order_id',updated_at=now()
WHERE transaction_id=(p_payload->>'transaction_id')::uuid AND payment_status='order_pending'
AND (razorpay_order_id IS NULL OR razorpay_order_id=p_payload->>'razorpay_order_id') RETURNING * INTO v_tx;
IF NOT FOUND THEN RAISE EXCEPTION 'Payment order could not be attached to its transaction';END IF;RETURN to_jsonb(v_tx);
WHEN 'mark_authorized' THEN
UPDATE private.payment_transactions SET payment_status='authorized',updated_at=now() WHERE razorpay_order_id=p_payload->>'razorpay_order_id' AND payment_status='order_pending';
RETURN jsonb_build_object('ok',FOUND);
WHEN 'mark_failed' THEN
UPDATE private.payment_transactions SET payment_status='failed',failure_code=left(NULLIF(p_payload->>'failure_code',''),200),
failure_description=left(NULLIF(p_payload->>'failure_description',''),1000),updated_at=now()
WHERE razorpay_order_id=p_payload->>'razorpay_order_id' AND payment_status IN ('order_pending','authorized');RETURN jsonb_build_object('ok',FOUND);
WHEN 'record_webhook' THEN
INSERT INTO private.razorpay_webhook_events(event_id,event_type,razorpay_order_id,razorpay_payment_id,signature_verified,processing_status,attempt_count,received_at)
VALUES(p_payload->>'event_id',p_payload->>'event_type',NULLIF(p_payload->>'razorpay_order_id',''),NULLIF(p_payload->>'razorpay_payment_id',''),true,'processing',1,now())
ON CONFLICT(event_id) DO NOTHING RETURNING event_id INTO v_inserted_event;
IF v_inserted_event IS NOT NULL THEN RETURN jsonb_build_object('duplicate',false,'processing',true);END IF;
SELECT * INTO v_event FROM private.razorpay_webhook_events WHERE event_id=p_payload->>'event_id' FOR UPDATE;
IF NOT FOUND OR v_event.processing_status='processed' OR (v_event.processing_status='processing' AND v_event.received_at>now()-interval '2 minutes')
THEN RETURN jsonb_build_object('duplicate',true,'processing',false);END IF;
UPDATE private.razorpay_webhook_events SET processing_status='processing',attempt_count=attempt_count+1,received_at=now(),last_error=NULL WHERE event_id=p_payload->>'event_id';
RETURN jsonb_build_object('duplicate',false,'processing',true);
WHEN 'finish_webhook' THEN
UPDATE private.razorpay_webhook_events SET processing_status=p_payload->>'processing_status',
processed_at=CASE WHEN p_payload->>'processing_status'='processed' THEN now() ELSE NULL END,last_error=left(NULLIF(p_payload->>'last_error',''),1000)
WHERE event_id=p_payload->>'event_id' AND p_payload->>'processing_status' IN ('processed','failed');RETURN jsonb_build_object('ok',FOUND);
WHEN 'activate_transaction' THEN
SELECT * INTO v_tx FROM private.payment_transactions WHERE transaction_id=(p_payload->>'transaction_id')::uuid FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Payment transaction was not found';END IF;
IF v_tx.payment_status='activated' THEN RETURN jsonb_build_object('activated',true,'already_activated',true,'subscriber_id',v_tx.subscriber_id,'transaction_id',v_tx.transaction_id);END IF;
IF v_tx.environment<>'test' OR v_tx.payment_status='refunded' THEN RAISE EXCEPTION 'This transaction is not eligible for activation';END IF;
v_payment_id:=NULLIF(p_payload->>'razorpay_payment_id','');
IF v_payment_id IS NULL OR (v_tx.razorpay_payment_id IS NOT NULL AND v_tx.razorpay_payment_id<>v_payment_id) THEN RAISE EXCEPTION 'Payment identifier does not match this transaction';END IF;
SELECT s."SubscriptionId",s."Tokens",NULLIF(regexp_replace(btrim(s."Amount"),'[^0-9.]','','g'),''),
NULLIF(regexp_replace(btrim(s."TimeValidity"),'[^0-9]','','g'),'')::bigint INTO v_subscription_id,v_tokens,v_amount_text,v_validity_days
FROM public."Subscriptions" s WHERE s."SubscriptionId"=v_tx.subscription_id FOR KEY SHARE;
IF NOT FOUND OR v_tokens<>v_tx.tokens_granted OR v_amount_text IS NULL OR v_amount_text::numeric*100<>v_tx.amount_paise
OR v_validity_days IS NULL OR v_validity_days*86400<>v_tx.validity_seconds THEN RAISE EXCEPTION 'The subscription catalogue changed after this order was created';END IF;
PERFORM 1 FROM public."Students" WHERE "StudentId"=v_tx.student_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'The student account no longer exists';END IF;
SELECT max("EndDate") INTO v_latest_end FROM public."Subscribers" WHERE "StudentId"=v_tx.student_id;
v_start:=GREATEST(COALESCE(v_latest_end,v_now_utc),v_now_utc);v_end:=v_start+make_interval(secs=>v_tx.validity_seconds);
INSERT INTO public."Subscribers"("StudentId","StartDate","EndDate","SubscriptionId","RemainingTokens")
VALUES(v_tx.student_id,v_start,v_end,v_tx.subscription_id,v_tx.tokens_granted) RETURNING "SubscriberId" INTO v_subscriber_id;
UPDATE private.payment_transactions SET razorpay_payment_id=v_payment_id,payment_status='activated',
signature_verified_at=CASE WHEN COALESCE((p_payload->>'signature_verified')::boolean,false) THEN COALESCE(signature_verified_at,now()) ELSE signature_verified_at END,
captured_at=COALESCE(captured_at,now()),subscriber_id=v_subscriber_id,activated_at=now(),updated_at=now() WHERE transaction_id=v_tx.transaction_id;
RETURN jsonb_build_object('activated',true,'already_activated',false,'transaction_id',v_tx.transaction_id,'subscriber_id',v_subscriber_id,
'start_date',v_start,'end_date',v_end,'queued',v_start>v_now_utc);
ELSE RAISE EXCEPTION 'Unsupported subscription payment action';
END CASE;
END;
$function$;
REVOKE ALL ON FUNCTION public.pm_subscription_payment_action(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pm_subscription_payment_action(text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
