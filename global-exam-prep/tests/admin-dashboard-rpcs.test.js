import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const MIGRATION = readFileSync(
  `${globalThis.process.cwd()}/supabase/migrations/20261106061912_admin_dashboard_read_models.sql`,
  'utf8',
);

const ROOT = '11111111-1111-1111-1111-111111111111';
const ADMIN = '22222222-2222-2222-2222-222222222222';
const STUDENT_UID_1 = '33333333-3333-3333-3333-333333333333';
const STUDENT_UID_2 = '44444444-4444-4444-4444-444444444444';

const fixture = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;

  grant usage on schema public to anon, authenticated, service_role;
  create schema auth;
  create schema private;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('test.uid', true), '')::uuid
  $$;

  create table public."Admins" (
    "AdminId" uuid primary key,
    auth_uid uuid not null,
    "FullName" text,
    "Email" text,
    "isSuperAdmin" boolean not null default false,
    created_at timestamptz not null default now()
  );

  create table public."Courses" (
    "CourseId" bigint primary key,
    "CourseName" text not null
  );

  create table public."Subjects" (
    "SubjectId" bigint primary key,
    "SubjectName" text not null,
    "CourseId" bigint not null,
    "Semester" integer not null
  );

  create table public."Students" (
    "StudentId" bigint primary key,
    auth_uid uuid not null,
    "FullName" text,
    "Email" text,
    "IsSpam" boolean not null default false,
    role text not null default 'student',
    created_at timestamptz not null default now()
  );

  create table public."Feedbacks" (
    "FeedbackId" bigint primary key,
    "Description" text not null,
    "Type" text not null,
    "isSpam" boolean not null default false,
    "isBookmark" boolean not null default false,
    "isSeen" boolean not null default false,
    "StudentId" bigint not null
  );

  create table private.exam_attempts (
    id uuid primary key,
    user_id uuid not null,
    subject_id bigint,
    attempt_type text not null,
    status text not null,
    score integer,
    total_marks integer,
    submitted_at timestamptz
  );

  alter table public."Admins" enable row level security;
  alter table public."Students" enable row level security;
  alter table public."Feedbacks" enable row level security;
  alter table private.exam_attempts enable row level security;

  insert into public."Admins" ("AdminId", auth_uid, "FullName", "Email", "isSuperAdmin") values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '${ROOT}', 'Root Admin', 'root@x.com', true),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '${ADMIN}', 'Course Admin', 'admin@x.com', false);

  insert into public."Courses" values
    (1, 'Computer Engineering'),
    (2, 'Information Technology');

  insert into public."Subjects" values
    (11, 'Python Programming', 1, 3),
    (12, 'Database Management', 1, 4),
    (13, 'Data Structures', 2, 2),
    (14, 'Old Subject', 1, 1);

  insert into public."Students"
    ("StudentId", auth_uid, "FullName", "Email", "IsSpam", role, created_at) values
    (101, '${STUDENT_UID_1}', 'Student One', 'one@x.com', false, 'student', now() - interval '20 days'),
    (102, '${STUDENT_UID_2}', 'Student Two', 'two@x.com', true, 'student', now() - interval '10 days'),
    (103, '55555555-5555-5555-5555-555555555555', 'Student Three', 'three@x.com', false, 'student', now() - interval '5 days'),
    (104, '66666666-6666-6666-6666-666666666666', 'Not A Student', 'staff-profile@x.com', false, 'admin', now());

  insert into public."Feedbacks"
    ("FeedbackId", "Description", "Type", "isSpam", "isBookmark", "isSeen", "StudentId") values
    (201, 'Important feature request for the exam review screen.', 'Feature Request', false, true, false, 101),
    (202, 'The question timer is not updating consistently.', 'Bug Report', false, true, true, 102),
    (203, 'A general note that has not been reviewed.', 'General Feedback', false, false, false, 103);

  insert into private.exam_attempts
    (id, user_id, subject_id, attempt_type, status, score, total_marks, submitted_at) values
    ('10000000-0000-0000-0000-000000000001', '${STUDENT_UID_1}', 11, 'exam', 'submitted', 8, 10, now() - interval '1 day'),
    ('10000000-0000-0000-0000-000000000002', '${STUDENT_UID_2}', 11, 'exam', 'auto_submitted', 7, 10, now() - interval '2 days'),
    ('10000000-0000-0000-0000-000000000003', '${STUDENT_UID_1}', 11, 'test_room', 'submitted', 9, 10, now() - interval '3 days'),
    ('10000000-0000-0000-0000-000000000004', '${STUDENT_UID_1}', 12, 'exam', 'submitted', 7, 10, now() - interval '1 day'),
    ('10000000-0000-0000-0000-000000000005', '${STUDENT_UID_2}', 12, 'test_room', 'disconnected', 6, 10, now() - interval '2 days'),
    ('10000000-0000-0000-0000-000000000006', '${STUDENT_UID_1}', 13, 'exam', 'timed_out', 4, 10, now() - interval '4 days'),
    ('10000000-0000-0000-0000-000000000007', '${STUDENT_UID_1}', 11, 'exam', 'submitted', 8, 10, now() - interval '9 days'),
    ('10000000-0000-0000-0000-000000000008', '${STUDENT_UID_1}', 14, 'exam', 'submitted', 8, 10, now() - interval '20 days');
`;

let db;

async function asRole(role, query) {
  await db.exec(`set role ${role}`);
  try {
    return await db.query(query);
  } finally {
    await db.exec('reset role');
  }
}

async function callAs(uid, query, role = 'authenticated') {
  await db.exec(`set test.uid = '${uid}'`);
  try {
    return await asRole(role, query);
  } finally {
    await db.exec("set test.uid = ''");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fixture);
  await db.exec(MIGRATION);
}, 120000);

afterAll(async () => { await db?.close(); });

describe('admin dashboard read models', () => {
  it('returns a compact first-stage overview for normal admins', async () => {
    const out = await callAs(ADMIN, 'select public.admin_get_dashboard_overview() as data');
    expect(out.rows[0].data).toEqual({
      students: 3,
      attemptsLast7Days: 6,
      pendingFeedback: 2,
      flaggedStudents: 1,
      bookmarkedFeedback: 2,
    });
  });

  it('ranks only finalized attempts with canonical subject IDs and compares the prior week', async () => {
    const out = await callAs(ADMIN, 'select public.admin_get_dashboard_subject_activity() as data');
    expect(out.rows[0].data).toHaveLength(3);
    expect(out.rows[0].data[0]).toMatchObject({
      subjectId: 11,
      subjectName: 'Python Programming',
      courseName: 'Computer Engineering',
      attempts: 3,
      previousAttempts: 1,
      uniqueStudents: 2,
      normalAttempts: 2,
      testRoomAttempts: 1,
    });
    expect(out.rows[0].data[1]).toMatchObject({
      subjectId: 12,
      subjectName: 'Database Management',
      attempts: 2,
      testRoomAttempts: 1,
    });
    expect(out.rows[0].data[2]).toMatchObject({
      subjectId: 13,
      subjectName: 'Data Structures',
      attempts: 1,
    });
  });

  it('returns a bounded bookmark and flagged-student preview', async () => {
    const out = await callAs(
      ADMIN,
      'select public.admin_get_dashboard_moderation_preview(1) as data',
    );
    expect(out.rows[0].data.bookmarkedFeedback).toHaveLength(1);
    expect(out.rows[0].data.bookmarkedFeedback[0]).toMatchObject({
      feedbackId: 202,
      studentName: 'Student Two',
      isSeen: true,
    });
    expect(out.rows[0].data.flaggedStudents).toHaveLength(1);
    expect(out.rows[0].data.flaggedStudents[0]).toMatchObject({
      studentId: 102,
      studentName: 'Student Two',
      email: 'two@x.com',
      feedbackCount: 1,
    });
  });

  it('returns only display-safe staff fields and refuses normal admins', async () => {
    const out = await callAs(ROOT, 'select public.admin_get_dashboard_staff() as data');
    expect(out.rows[0].data).toHaveLength(2);
    expect(out.rows[0].data[0]).toMatchObject({
      email: 'root@x.com',
      isSuperAdmin: true,
    });
    expect(Object.keys(out.rows[0].data[0]).sort()).toEqual([
      'adminId', 'createdAt', 'email', 'isSuperAdmin', 'name',
    ]);
    await expect(callAs(ADMIN, 'select public.admin_get_dashboard_staff()')).rejects.toThrow(/not_authorized/i);
  });

  it('refuses students and anon callers without changing direct table grants', async () => {
    await expect(callAs(STUDENT_UID_1, 'select public.admin_get_dashboard_overview()')).rejects.toThrow(/not_authorized/i);
    await expect(callAs(ROOT, 'select public.admin_get_dashboard_overview()', 'anon')).rejects.toThrow(/permission denied/i);
    const grants = await db.query(`
      select has_table_privilege('authenticated', 'private.exam_attempts', 'SELECT') as can_read_attempts,
             has_table_privilege('authenticated', 'public."Admins"', 'SELECT') as can_read_admins
    `);
    expect(grants.rows[0]).toMatchObject({
      can_read_attempts: false,
      can_read_admins: false,
    });
  });
});
