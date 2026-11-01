begin;

drop function if exists public.pm_student_question_bank_candidates(bigint,text);

create or replace function public.pm_student_question_bank_candidates(
  p_subject_id bigint, p_exam_type text, p_question_type text, p_difficulty text
) returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $$
  select jsonb_build_object('banks', coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'source_file_name', b.source_file_name,
    'published_at', b.published_at,
    'sets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'set_number', s.set_number,
        'question_count', s.question_count, 'is_complete', s.is_complete
      ) order by s.set_number)
      from private.question_bank_sets s
      where s.bank_id=b.id and s.is_complete=true and s.question_count=30
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', limited.id, 'set_id', limited.set_id, 'sort_order', limited.sort_order,
        'question_type', limited.question_type, 'question_text', limited.question_text,
        'options', limited.options, 'correct_option_index', limited.correct_option_index,
        'model_answer', limited.model_answer, 'marks', limited.marks,
        'difficulty', limited.difficulty, 'rubric', limited.rubric,
        'validation_status', limited.validation_status
      ) order by limited.sort_order)
      from (
        select q.id,q.set_id,q.sort_order,q.question_type,q.question_text,
               q.options,q.correct_option_index,q.model_answer,q.marks,
               q.difficulty,q.rubric,q.validation_status
        from private.question_bank_questions q
        where q.bank_id=b.id and q.include_in_publish=true
          and q.validation_status='valid'
          and q.question_type=p_question_type and q.difficulty=p_difficulty
        order by q.sort_order limit 300
      ) limited
    ), '[]'::jsonb)
  ) order by b.published_at desc), '[]'::jsonb))
  from private.question_banks b
  where b.subject_id=p_subject_id and b.exam_type=p_exam_type and b.status='published';
$$;

revoke all on function public.pm_student_question_bank_candidates(bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.pm_student_question_bank_candidates(bigint,text,text,text) to service_role;

commit;
