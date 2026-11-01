# PrepMaster â€” Current Status

_Last updated: 2026-11-01_

## 1. Repository and deployment

- Repository: dakshhadvani19/prep_master_
- Default branch: main
- App root: global-exam-prep
- Vercel project: prepmaster-tau.vercel.app
- Git policy: work lands directly on main; do not create or merge PRs unless explicitly requested.

## 2. Current architecture

React 19 + Vite, React Router, Framer Motion, Lucide, CSS design system, Supabase JS, and browser-local/static adapters for features whose persistent database design is still pending.

### Authentication

Supabase Auth is the only authentication provider: email/password, Google OAuth with PKCE, custom server-generated OTP signup gate, public.students, public.admins, and RLS-backed authorization.

## 3. Legacy backend removal

The previous secondary backend integration has been removed from the application.

Removed:
- SDK dependency
- initialization module
- database rules/configuration
- dedicated build chunk
- environment variables
- CSP endpoints
- test mocks
- remote exam-history reads/writes
- remote syllabus/storage reads/writes

Replacement behavior:

| Previous capability | Current temporary behavior |
|---|---|
| Exam history | Authenticated persisted attempt APIs (normal exams and Test Room participant attempts) |
| Exam review | Owner-checked review APIs; no browser-local fallback |
| Syllabus upload | Extract PDF text and keep metadata/text in browser storage |
| Syllabus PDF URL | Current-session object URL on¶»§q«^