begin;

create or replace function public.pm_student_question_bank_candidates(
  p_subject_id bigint, p_exam_type text
) returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $$
  select jsonb_build_object(
    'banks',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'source_file_name', b.source_file_name,
          'published_at', b.published_at,
          'sets', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', s.id, 'set_number', s.set_number,
              'question_count', s.question_count, 'is_complete', s.is_complete
            ) order by s.set_number)
            from private.question_bank_sets s where s.bank_id=b.id
          ), '[]'::jsonb),
          'questions', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', q.id, 'set_id', q.set_id, 'sort_order', q.sort_order,
              'question_type', q.question_type, 'question_text', q.question_text,
              'options', q.options, 'correct_option_index', q.correct_option_index,
              'model_answer', q.model_answer, 'marks', q.marks,
              'difficulty', q.difficulty, 'rubric', q.rubric,
              'validation_status', q.validation_status
            ) order by q.sort_order)
            from private.question_bank_questions q
            where q.bank_id=b.id and q.include_in_publish=true
          ), '[]'::jsonb)
        ) order by b.published_at desc
      ),
      '[]'::jsonb
    )
  )
  from private.question_banks b
  where b.subject_id=p_subject_id and b.exam_type=p_exam_type and b.status='published';
$$;

revoke all on function public.pm_student_question_bank_candidates(bigint,text) from public,anon,authenticated;
grant execute on function public.pm_student_question_bank_candidates(bigint,text) to service_role;

commit;
