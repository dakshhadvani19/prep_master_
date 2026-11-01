begin;

drop function if exists public.pm_admin_course_bank_publish(uuid,uuid);

create or replace function public.pm_admin_course_bank_publish(
  p_admin_auth_uid uuid,
  p_upload_id uuid,
  p_expected_total_marks numeric default null,
  p_acknowledge_mark_mismatch boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,private,pg_temp
as $$
declare
  b private.question_banks;
  n integer;
  grp record;
  new_set private.question_bank_sets;
begin
  if not exists(select 1 from public."Admins" where auth_uid=p_admin_auth_uid) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  select * into b from private.question_banks where source_upload_id=p_upload_id for update;
  if not found or b.status<>'review' then
    raise exception 'question_bank_not_in_review' using errcode='P0002';
  end if;

  if exists(
    select 1 from private.question_bank_questions q
    where q.bank_id=b.id and q.include_in_publish and (
      q.validation_status<>'valid' or q.marks is null or q.marks<=0 or q.difficulty is null
      or (q.question_type='mcq' and (jsonb_array_length(q.options)<>4 or q.correct_option_index is null))
      or (q.question_type='theory' and nullif(trim(q.model_answer),'') is null)
      or (q.rubric_generated and not q.rubric_reviewed)
    )
  ) then
    raise exception 'included_questions_need_validation' using errcode='22023';
  end if;

  if p_expected_total_marks is not null and p_expected_total_marks > 0
     and not coalesce(p_acknowledge_mark_mismatch,false)
     and exists(
       with ranked as (
         select marks, ((row_number() over(order by sort_order)-1)/30)::integer as set_index
         from private.question_bank_questions
         where bank_id=b.id and include_in_publish and question_type='mcq'
       ),
       totals as (
         select set_index,count(*) as item_count,sum(marks) as marks_total
         from ranked group by set_index
       )
       select 1 from totals
       where item_count=30 and marks_total<>p_expected_total_marks
     )
  then
    raise exception 'question_mark_total_mismatch' using errcode='22023';
  end if;

  select count(*) into n from private.question_bank_questions
  where bank_id=b.id and include_in_publish;
  if n=0 then raise exception 'no_questions_selected_for_publish' using errcode='22023'; end if;

  delete from private.question_bank_sets where bank_id=b.id;
  for grp in
    with ranked as (
      select ((row_number() over(order by sort_order)-1)/30+1)::integer as set_no
      from private.question_bank_questions
      where bank_id=b.id and include_in_publish and question_type='mcq'
    )
    select set_no,count(*)::integer as question_count from ranked group by set_no order by set_no
  loop
    insert into private.question_bank_sets(bank_id,set_number,question_count,is_complete)
    values(b.id,grp.set_no,grp.question_count,grp.question_count=30)
    returning * into new_set;
    with ranked as (
      select id,((row_number() over(order by sort_order)-1)/30+1)::integer as set_no
      from private.question_bank_questions
      where bank_id=b.id and include_in_publish and question_type='mcq'
    )
    update private.question_bank_questions q
      set set_id=new_set.id
    from ranked r
    where q.id=r.id and r.set_no=grp.set_no;
  end loop;

  update private.question_banks
  set status='published',published_questions=n,published_at=now(),updated_at=now()
  where id=b.id returning * into b;
  update private.admin_course_uploads set status='published',updated_at=now()
  where id=p_upload_id;

  return jsonb_build_object(
    'bank_id',b.id,
    'published_questions',n,
    'mcq_questions',b.mcq_questions,
    'theory_questions',b.theory_questions,
    'sets',coalesce((
      select jsonb_agg(jsonb_build_object(
        'set_number',s.set_number,'question_count',s.question_count,'is_complete',s.is_complete
      ) order by s.set_number)
      from private.question_bank_sets s where s.bank_id=b.id
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.pm_admin_course_bank_publish(uuid,uuid,numeric,boolean) from public,anon,authenticated;
grant execute on function public.pm_admin_course_bank_publish(uuid,uuid,numeric,boolean) to service_role;

commit;
notify pgrst,'reload schema';