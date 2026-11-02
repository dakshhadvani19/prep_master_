begin;
select pgmq.create('admin_course_upload_jobs');
select pgmq.create('admin_course_upload_dead_letters');
alter table private.admin_course_uploads drop constraint if exists admin_course_uploads_status_check;
alter table private.admin_course_uploads add constraint admin_course_uploads_status_check check (status in (
    'uploading', 'queued', 'processing', 'retry_waiting', 'validating',
    'needs_confirmation', 'validated_waiting_phase3', 'needs_review',
    'published', 'active', 'superseded', 'failed'
));
alter table private.admin_course_uploads
    add column if not exists processing_attempts integer not null default 0 check (processing_attempts between 0 and 20),
    add column if not exists accepted_at timestamptz,
    add column if not exists processing_started_at timestamptz,
    add column if not exists next_retry_at timestamptz,
    add column if not exists last_processing_error text;
create index if not exists admin_course_uploads_queue_status_idx
    on private.admin_course_uploads(status, accepted_at)
    where status in ('queued', 'processing', 'retry_waiting');

create or replace function public.pm_admin_course_upload_accept(p_admin_auth_uid uuid, p_upload_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, pgmq, auth, pg_temp
as $function$
declare v_upload private.admin_course_uploads; v_message_id bigint;
begin
    if not exists (select 1 from public."Admins" a where a.auth_uid = p_admin_auth_uid) then raise exception 'not_authorized' using errcode='42501'; end if;
    select * into v_upload from private.admin_course_uploads where id=p_upload_id for update;
    if not found then raise exception 'upload_not_found' using errcode='P0002'; end if;
    if v_upload.status <> 'uploading' then return to_jsonb(v_upload); end if;
    update private.admin_course_uploads set status='queued',accepted_at=coalesce(accepted_at,now()),
        uploaded_at=coalesce(uploaded_at,now()),updated_at=now(),error_message=null
    where id=p_upload_id returning * into v_upload;
    select pgmq.send('admin_course_upload_jobs',jsonb_build_object('upload_id',p_upload_id::text)) into v_message_id;
    return to_jsonb(v_upload)||jsonb_build_object('queue_message_id',v_message_id);
end;
$function$;

create or replace function public.pm_admin_course_upload_job_claim()
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,pgmq,auth,pg_temp
as $function$
declare v_job record; v_upload private.admin_course_uploads; v_upload_id uuid;
begin
    if coalesce(auth.role(),'') <> 'service_role' then raise exception 'not_authorized' using errcode='42501'; end if;
    select * into v_job from pgmq.read('admin_course_upload_jobs',90,1,'{}'::jsonb);
    if not found then return null; end if;
    v_upload_id := (v_job.message->>'upload_id')::uuid;
    update private.admin_course_uploads set status='processing',processing_attempts=processing_attempts+1,
        processing_started_at=now(),next_retry_at=null,updated_at=now()
    where id=v_upload_id and status in ('queued','processing') and processing_attempts<20
    returning * into v_upload;
    if not found then perform pgmq.archive('admin_course_upload_jobs',v_job.msg_id); return null; end if;
    return to_jsonb(v_upload)||jsonb_build_object('queue_message_id',v_job.msg_id,'queue_read_count',v_job.read_ct);
end;
$function$;

create or replace function public.pm_admin_course_upload_job_finish(
    p_upload_id uuid,p_message_id bigint,p_status text,p_validation_details jsonb default '{}'::jsonb,
    p_preview_text text default null,p_page_count integer default null,p_word_count integer default null,
    p_row_count integer default null,p_error_message text default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,pgmq,auth,pg_temp
as $function$
declare v_upload private.admin_course_uploads;
begin
    if coalesce(auth.role(),'') <> 'service_role' then raise exception 'not_authorized' using errcode='42501'; end if;
    if p_status not in ('needs_confirmation','validated_waiting_phase3','failed') then raise exception 'invalid_upload_status' using errcode='22023'; end if;
    update private.admin_course_uploads set status=p_status,is_active=false,
        validation_details=coalesce(p_validation_details,'{}'::jsonb),preview_text=left(p_preview_text,4000),
        page_count=p_page_count,word_count=p_word_count,row_count=p_row_count,
        error_message=case when p_status='failed' then left(p_error_message,500) else null end,
        last_processing_error=null,next_retry_at=null,updated_at=now(),uploaded_at=coalesce(uploaded_at,now()),
        validated_at=case when p_status in ('needs_confirmation','validated_waiting_phase3') then now() else validated_at end
    where id=p_upload_id and status='processing' returning * into v_upload;
    if not found then raise exception 'upload_not_processing' using errcode='P0002'; end if;
    perform pgmq.archive('admin_course_upload_jobs',p_message_id);
    return to_jsonb(v_upload);
end;
$function$;

create or replace function public.pm_admin_course_upload_job_retry(p_upload_id uuid,p_message_id bigint,p_error_message text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,pgmq,auth,pg_temp
as $function$
declare v_upload private.admin_course_uploads; v_delay integer;
begin
    if coalesce(auth.role(),'') <> 'service_role' then raise exception 'not_authorized' using errcode='42501'; end if;
    select * into v_upload from private.admin_course_uploads where id=p_upload_id for update;
    if not found or v_upload.status<>'processing' then raise exception 'upload_not_processing' using errcode='P0002'; end if;
    if v_upload.processing_attempts>=5 then
        update private.admin_course_uploads set status='retry_waiting',
            error_message='Automatic processing could not finish after five attempts. Select Retry processing to try again.',
            last_processing_error=left(p_error_message,1000),next_retry_at=null,updated_at=now()
        where id=p_upload_id returning * into v_upload;
        perform pgmq.send('admin_course_upload_dead_letters',jsonb_build_object(
            'upload_id',p_upload_id::text,'message_id',p_message_id,'attempts',v_upload.processing_attempts,
            'last_error',left(p_error_message,1000)));
        perform pgmq.archive('admin_course_upload_jobs',p_message_id);
        return to_jsonb(v_upload);
    end if;
    v_delay:=least(900,(30*power(2,greatest(v_upload.processing_attempts-1,0)))::integer);
    update private.admin_course_uploads set status='queued',error_message=null,
        last_processing_error=left(p_error_message,1000),next_retry_at=now()+make_interval(secs=>v_delay),updated_at=now()
    where id=p_upload_id returning * into v_upload;
    perform pgmq.set_vt('admin_course_upload_jobs',p_message_id,v_delay);
    return to_jsonb(v_upload);
end;
$function$;

create or replace function public.pm_admin_course_upload_retry_processing(p_admin_auth_uid uuid,p_upload_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,pgmq,auth,pg_temp
as $function$
declare v_upload private.admin_course_uploads; v_message_id bigint;
begin
    if not exists(select 1 from public."Admins" a where a.auth_uid=p_admin_auth_uid) then raise exception 'not_authorized' using errcode='42501'; end if;
    update private.admin_course_uploads set status='queued',processing_attempts=0,processing_started_at=null,
        next_retry_at=null,last_processing_error=null,error_message=null,accepted_at=coalesce(accepted_at,now()),updated_at=now()
    where id=p_upload_id and status='retry_waiting' returning * into v_upload;
    if not found then raise exception 'upload_not_waiting_for_retry' using errcode='P0002'; end if;
    select pgmq.send('admin_course_upload_jobs',jsonb_build_object('upload_id',p_upload_id::text)) into v_message_id;
    return to_jsonb(v_upload)||jsonb_build_object('queue_message_id',v_message_id);
end;
$function$;

revoke all on function public.pm_admin_course_upload_accept(uuid,uuid) from public,anon,authenticated;
revoke all on function public.pm_admin_course_upload_job_claim() from public,anon,authenticated;
revoke all on function public.pm_admin_course_upload_job_finish(uuid,bigint,text,jsonb,text,integer,integer,integer,text) from public,anon,authenticated;
revoke all on function public.pm_admin_course_upload_job_retry(uuid,bigint,text) from public,anon,authenticated;
revoke all on function public.pm_admin_course_upload_retry_processing(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pm_admin_course_upload_accept(uuid,uuid) to service_role;
grant execute on function public.pm_admin_course_upload_job_claim() to service_role;
grant execute on function public.pm_admin_course_upload_job_finish(uuid,bigint,text,jsonb,text,integer,integer,integer,text) to service_role;
grant execute on function public.pm_admin_course_upload_job_retry(uuid,bigint,text) to service_role;
grant execute on function public.pm_admin_course_upload_retry_processing(uuid,uuid) to service_role;
commit;
notify pgrst,'reload schema';
