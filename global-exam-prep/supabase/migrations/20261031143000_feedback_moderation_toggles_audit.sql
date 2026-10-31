-- Feedback moderation switches, Spam/Bookmark exclusion, and click audit trail.
-- Only an authenticated admin can toggle feedback flags through the RPC.
-- The audit table remains in the private schema with no direct client grants.

begin;

drop trigger if exists feedbacks_prevent_status_reversal
    on public."Feedbacks";

drop function if exists public.prevent_feedback_status_reversal();

-- Resolve legacy rows that already have both mutually-exclusive flags enabled.
-- Spam takes precedence in that exceptional legacy state.
update public."Feedbacks"
   set "isBookmark" = false
 where "isSpam" = true
   and "isBookmark" = true;

do $constraint$
begin
    if not exists (
        select 1
          from pg_constraint
         where conrelid = 'public."Feedbacks"'::regclass
           and conname = 'feedbacks_spam_bookmark_exclusive'
    ) then
        alter table public."Feedbacks"
            add constraint feedbacks_spam_bookmark_exclusive
            check (not ("isSpam" and "isBookmark")) not valid;
    end if;
end;
$constraint$;

alter table public."Feedbacks"
    validate constraint feedbacks_spam_bookmark_exclusive;

create table if not exists private.feedback_moderation_events (
    id bigint generated always as identity primary key,
    feedback_id bigint not null
        references public."Feedbacks" ("FeedbackId") on delete cascade,
    admin_auth_uid uuid not null
        references auth.users (id) on delete restrict,
    action text not null
        check (action in ('seen', 'bookmark', 'spam')),
    previous_value boolean not null,
    requested_value boolean not null,
    outcome text not null
        check (outcome in ('updated', 'blocked')),
    reason text,
    created_at timestamptz not null default now()
);

create index if not exists feedback_moderation_events_feedback_created_idx
    on private.feedback_moderation_events (feedback_id, created_at desc);

create index if not exists feedback_moderation_events_admin_created_idx
    on private.feedback_moderation_events (admin_auth_uid, created_at desc);

alter table private.feedback_moderation_events enable row level security;
alter table private.feedback_moderation_events force row level security;
revoke all on table private.feedback_moderation_events from public, anon, authenticated;

create or replace function public.admin_update_feedback_flag(
    p_feedback_id bigint,
    p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    admin_uid uuid := auth.uid();
    action_name text := lower(trim(coalesce(p_action, '')));
    spam_flag boolean;
    bookmark_flag boolean;
    seen_flag boolean;
    previous_flag boolean;
    requested_flag boolean;
    block_reason text;
begin
    if admin_uid is null or not exists (
        select 1
          from public."Admins" a
         where a.auth_uid = admin_uid
    ) then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    if action_name not in ('seen', 'bookmark', 'spam') then
        raise exception 'invalid_feedback_action' using errcode = '22023';
    end if;

    select f."isSpam", f."isBookmark", f."isSeen"
      into spam_flag, bookmark_flag, seen_flag
      from public."Feedbacks" f
     where f."FeedbackId" = p_feedback_id
     for update;

    if not found then
        raise exception 'feedback_not_found' using errcode = 'P0002';
    end if;

    previous_flag := case action_name
        when 'seen' then seen_flag
        when 'bookmark' then bookmark_flag
        when 'spam' then spam_flag
    end;
    requested_flag := not previous_flag;

    block_reason := case
        when requested_flag and action_name = 'bookmark' and spam_flag
            then 'This feedback is marked as spam. Turn Spam off before bookmarking.'
        when requested_flag and action_name = 'spam' and bookmark_flag
            then 'Remove the Bookmark flag before marking this feedback as spam.'
        else null
    end;

    if block_reason is not null then
        insert into private.feedback_moderation_events (
            feedback_id,
            admin_auth_uid,
            action,
            previous_value,
            requested_value,
            outcome,
            reason
        ) values (
            p_feedback_id,
            admin_uid,
            action_name,
            previous_flag,
            requested_flag,
            'blocked',
            block_reason
        );

        return jsonb_build_object(
            'ok', false,
            'message', block_reason,
            'feedbackId', p_feedback_id,
            'isSpam', spam_flag,
            'isBookmark', bookmark_flag,
            'isSeen', seen_flag
        );
    end if;

    update public."Feedbacks" f
       set "isSpam" = case when action_name = 'spam' then requested_flag else f."isSpam" end,
           "isBookmark" = case when action_name = 'bookmark' then requested_flag else f."isBookmark" end,
           "isSeen" = case when action_name = 'seen' then requested_flag else f."isSeen" end
     where f."FeedbackId" = p_feedback_id
     returning f."isSpam", f."isBookmark", f."isSeen"
          into spam_flag, bookmark_flag, seen_flag;

    insert into private.feedback_moderation_events (
        feedback_id,
        admin_auth_uid,
        action,
        previous_value,
        requested_value,
        outcome
    ) values (
        p_feedback_id,
        admin_uid,
        action_name,
        previous_flag,
        requested_flag,
        'updated'
    );

    return jsonb_build_object(
        'ok', true,
        'feedbackId', p_feedback_id,
        'action', action_name,
        'isSpam', spam_flag,
        'isBookmark', bookmark_flag,
        'isSeen', seen_flag
    );
end;
$function$;

alter function public.admin_update_feedback_flag(bigint, text) owner to postgres;
revoke all on function public.admin_update_feedback_flag(bigint, text) from public, anon;
grant execute on function public.admin_update_feedback_flag(bigint, text) to authenticated;

comment on function public.admin_update_feedback_flag(bigint, text) is
    'Admin-only feedback flag toggle. Spam and Bookmark are mutually exclusive; every toggle attempt is written to private.feedback_moderation_events.';

comment on table private.feedback_moderation_events is
    'Private audit history for admin feedback moderation toggle clicks, including blocked attempts.';

commit;

notify pgrst, 'reload schema';
