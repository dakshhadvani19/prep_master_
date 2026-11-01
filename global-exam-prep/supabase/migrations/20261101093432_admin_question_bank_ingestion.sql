begin;

alter table private.admin_course_uploads
  drop constraint if exists admin_course_uploads_status_check;
alter table private.admin_course_uploads
  add constraint admin_course_uploads_status_check check (status in (
    'uploading','validating','needs_confirmation','validated_waiting_phase3',
    'needs_review','published','active','superseded','failed'
  ));

create table if not exists private.question_banks (
  id uuid primary key default gen_random_uuid(),
  source_upload_id uuid not null unique references private.admin_course_uploads(id) on delete restrict,
  subject_id bigint not null,
  course_id bigint not null,
  semester integer not null,
  exam_type text not null,
  source_file_name text not null,
  status text not null default 'review' check (status in ('review','published')),
  total_questions integer not null default 0,
  valid_questions integer not null default 0,
  rejected_questions integer not null default 0,
  warning_questions integer not null default 0,
  mcq_questions integer not null default 0,
  theory_questions integer not null default 0,
  published_questions integer not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create table if not exists private.question_bank_sets (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references private.question_banks(id) on delete cascade,
  set_number integer not null check (set_number > 0),
  question_count integer not null check (question_count between 1 and 30),
  is_complete boolean not null,
  unique(bank_id,set_number)
);
create table if not exists private.question_bank_questions (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references private.question_banks(id) on delete cascade,
  set_id uuid references private.question_bank_sets(id) on delete set null,
  sort_order integer not null,
  question_type text not null check(question_type in ('mcq','theory')),
  question_text text not null,
  options jsonb not null default '[]'::jsonb check(jsonb_typeof(options)='array'),
  correct_option_index smallint check(correct_option_index is null or correct_option_index between 0 and 3),
  model_answer text,
  marks numeric(7,2),
  difficulty text check(difficulty is null or difficulty in ('easy','medium','hard')),
  rubric text,
  rubric_generated boolean not null default false,
  rubric_reviewed boolean not null default false,
  source_location jsonb not null default '{}'::jsonb,
  validation_status text not null check(validation_status in ('valid','warning','rejected')),
  validation_errors jsonb not null default '[]'::jsonb,
  include_in_publish boolean not null default true,
  unique(bank_id,sort_order)
);
create index if not exists question_banks_subject_idx on private.question_banks(subject_id,exam_type,created_at desc);
create index if not exists question_bank_questions_bank_idx on private.question_bank_questions(bank_id,sort_order);

alter table private.question_banks enable row level security;
alter table private.question_bank_sets enable row level security;
alter table private.question_bank_questions enable row level security;
revoke all on private.question_banks,private.question_bank_sets,private.question_bank_questions from public,anon,authenticated;
grant select,insert,update,delete on private.question_banks,private.question_bank_sets,private.question_bank_questions to service_role;

create or replace function public.pm_admin_course_bank_save_review(
  p_admin_auth_uid uuid,p_upload_id uuid,p_questions jsonb
) returns jsonb
language plpgsql security invoker
set search_path=pg_catalog,public,private,pg_temp
as $$
declare
  u private.admin_course_uploads;
  b private.question_banks;
  q jsonb;
  i integer:=0;
  total_n integer;
  valid_n integer;
  rejected_n integer;
  warning_n integer;
  mcq_n integer;
  theory_n integer;
begin
  if not exists(select 1 from public."Admins" where auth_uid=p_admin_auth_uid) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions)>10000 then
    raise exception 'invalid_question_payload' using errcode='22023';
  end if;
  select * into u from private.admin_course_uploads
    where id=p_upload_id and kind='question_bank' for update;
  if not found or u.status not in ('validated_waiting_phase3','needs_review') then
    raise exception 'question_bank_upload_not_ready' using errcode='P0002';
  end if;
  select * into b from private.question_banks where source_upload_id=p_upload_id for update;
  if found then
    if b.status='published' then raise exception 'question_bank_already_published' using errcode='23505'; end if;
    delete from private.question_bank_sets where bank_id=b.id;
    delete from private.question_bank_questions where bank_id=b.id;
  else
    insert into private.question_banks(source_upload_id,subject_id,course_id,semester,exam_type,source_file_name,created_by)
    values(u.id,u.subject_id,u.course_id,u.semester,u.exam_type,u.file_name,p_admin_auth_uid)
    returning * into b;
  end if;
  for q in select value from jsonb_array_elements(p_questions) loop
    i:=i+1;
    if q->>'question_type' not in ('mcq','theory') or nullif(trim(q->>'question_text'),'') is null then
      raise exception 'invalid_question_row_%',i using errcode='22023';
    end if;
    insert into private.question_bank_questions(
      bank_id,sort_order,question_type,question_text,options,correct_option_index,model_answer,
      marks,difficulty,rubric,rubric_generated,rubric_reviewed,source_location,
      validation_status,validation_errors,include_in_publish
    ) values (
      b.id,i,q->>'question_type',left(q->>'question_text',4000),
      case when jsonb_typeof(q->'options')='array' then q->'options' else '[]'::jsonb end,
      case when coalesce(q->>'correct_option_index','') ~ '^[0-3]$' then (q->>'correct_option_index')::smallint else null end,
      nullif(left(q->>'model_answer',12000),''),
      case when coalesce(q->>'marks','') ~ '^\d+(\.\d+)?$' then (q->>'marks')::numeric else null end,
      case when q->>'difficulty' in ('easy','medium','hard') then q->>'difficulty' else null end,
      nullif(left(q->>'rubric',6000),''),
      coalesce((q->>'rubric_generated')::boolean,false),
      coalesce((q->>'rubric_reviewed')::boolean,false),
      coalesce(q->'source_location','{}'::jsonb),
      case when q->>'validation_status' in ('valid','warning','rejected') then q->>'validation_status' else 'rejected' end,
      case when jsonb_typeof(q->'validation_errors')='array' then q->'validation_errors' else '[]'::jsonb end,
      coalesce((q->>'include_in_publish')::boolean,true)
    );
  end loop;
  select count(*),count(*) filter(where validation_status='valid'),
    count(*) filter(where validation_status='rejected'),count(*) filter(where validation_status='warning'),
    count(*) filter(where question_type='mcq'),count(*) filter(where question_type='theory')
  into total_n,valid_n,rejected_n,warning_n,mcq_n,theory_n
  from private.question_bank_questions where bank_id=b.id;
  update private.question_banks set total_questions=total_n,valid_questions=valid_n,
    rejected_questions=rejected_n,warning_questions=warning_n,mcq_questions=mcq_n,
    theory_questions=theory_n,status='review',updated_at=now()
  where id=b.id returning * into b;
  update private.admin_course_uploads set status='needs_review',updated_at=now()
  where id=p_upload_id;
  return public.pm_admin_course_bank_get(p_admin_auth_uid,p_upload_id);
end;
$$;

create or replace function public.pm_admin_course_bank_get(p_admin_auth_uid uuid,p_upload_id uuid)
returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public,private,pg_temp
as $$
declare b private.question_banks; result jsonb;
begin
  if not exists(select 1 from public."Admins" where auth_uid=p_admin_auth_uid) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  select * into b from private.question_banks where source_upload_id=p_upload_id;
  if not found then return null; end if;
  select jsonb_build_object(
    'bank',to_jsonb(b),
    'questions',coalesce(jsonb_agg(jsonb_build_object(
      'id',q.id,'sort_order',q.sort_order,'question_type',q.question_type,'question_text',q.question_text,
      'options',q.options,'correct_option_index',q.correct_option_index,'model_answer',q.model_answer,
      'marks',q.marks,'difficulty',q.difficulty,'rubric',q.rubric,'rubric_generated',q.rubric_generated,
      'rubric_reviewed',q.rubric_reviewed,'source_location',q.source_location,
      'validation_status',q.validation_status,'validation_errors',q.validation_errors,
      'include_in_publish',q.include_in_publish
    ) order by q.sort_order),'[]'::jsonb)
  ) into result from private.question_bank_questions q where q.bank_id=b.id;
  return result;
end;
$$;

create or replace function public.pm_admin_course_bank_publish(p_admin_auth_uid uuid,p_upload_id uuid)
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,public,private,pg_temp
as $$
declare b private.question_banks; n integer; grp record; new_set private.question_bank_sets;
begin
  if not exists(select 1 from public."Admins" where auth_uid=p_admin_auth_uid) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  select * into b from private.question_banks where source_upload_id=p_upload_id for update;
  if not found or b.status<>'review' then raise exception 'question_bank_not_in_review' using errcode='P0002'; end if;
  if exists(select 1 from private.question_bank_questions q where q.bank_id=b.id and q.include_in_publish and (
      q.validation_status<>'valid' or q.marks is null or q.marks<=0 or q.difficulty is null
      or (q.question_type='mcq' and (jsonb_array_length(q.options)<>4 or q.correct_option_index is null))
      or (q.question_type='theory' and nullif(trim(q.model_answer),'') is null)
      or (q.rubric_generated and not q.rubric_reviewed)
  )) then raise exception 'included_questions_need_validation' using errcode='22023'; end if;
  select count(*) into n from private.question_bank_questions where bank_id=b.id and include_in_publish;
  if n=0 then raise exception 'no_questions_selected_for_publish' using errcode='22023'; end if;
  delete from private.question_bank_sets where bank_id=b.id;
  for grp in
    with ranked as (
      select ((row_number() over(order by sort_order)-1)/30+1)::integer as set_no
      from private.question_bank_questions where bank_id=b.id and include_in_publish and question_type='mcq'
    )
    select set_no,count(*)::integer as question_count from ranked group by set_no order by set_no
  loop
    insert into private.question_bank_sets(bank_id,set_number,question_count,is_complete)
    values(b.id,grp.set_no,grp.question_count,grp.question_count=30) returning * into new_set;
    with ranked as (
      select id,((row_number() over(order by sort_order)-1)/30+1)::integer as set_no
      from private.question_bank_questions where bank_id=b.id and include_in_publish and question_type='mcq'
    )
    update private.question_bank_questions q set set_id=new_set.id
    from ranked r where q.id=r.id and r.set_no=grp.set_no;
  end loop;
  update private.question_banks set status='published',published_questions=n,published_at=now(),updated_at=now()
    where id=b.id returning * into b;
  update private.admin_course_uploads set status='published',updated_at=now() where id=p_upload_id;
  return jsonb_build_object('bank_id',b.id,'published_questions',n,'mcq_questions',b.mcq_questions,
    'theory_questions',b.theory_questions,'sets',coalesce((
      select jsonb_agg(jsonb_build_object('set_number',s.set_number,'question_count',s.question_count,'is_complete',s.is_complete) order by s.set_number)
      from private.question_bank_sets s where s.bank_id=b.id
    ),'[]'::jsonb));
end;
$$;

revoke all on function public.pm_admin_course_bank_save_review(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.pm_admin_course_bank_get(uuid,uuid) from public,anon,authenticated;
revoke all on function public.pm_admin_course_bank_publish(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pm_admin_course_bank_save_review(uuid,uuid,jsonb) to service_role;
grant execute on function public.pm_admin_course_bank_get(uuid,uuid) to service_role;
grant execute on function public.pm_admin_course_bank_publish(uuid,uuid) to service_role;

commit;