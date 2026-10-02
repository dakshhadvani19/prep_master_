# PrepMaster — Current Status

Update this file after every Agent Mode task. Keep it short, factual, and code-verified.
Long-term rules and architecture live in `PREPMaster_PROJECT_CONTEXT.md`.
Database-specific state lives in `PREPMaster_DATABASE_STATUS.md`.

**Last updated:** 2026-10-02 — database foundation + static-data preparation phase
**Verified from repository:** current project docs, migration directory, SRS references, and source-data
inventory paths.
**Live verification limitation:** this environment cannot independently inspect the live Supabase
catalog/feedback/leaderboard tables. Live state marked as owner-confirmed is not presented as
independently verified.

## Repository state

| Item | Value |
|---|---|
| Git root / app dir | `/home/user/prep_master_` / `global-exam-prep/` |
| Branch | `main` |
| Last pushed HEAD | `dd164dec330f006ae37c3b13be2ec1847b49a6fa` (`Correctised subjectId`) |
| Working tree | Previous documentation/session notes reported dirty; current live working tree is not independently writable from this session |
| Commit/push policy | Do not commit/push unless the owner explicitly asks |

## Architecture snapshot

React + Vite SPA.

Authentication:
- Supabase Auth
- admin authorization from `public.admins`
- AuthContext owns role resolution

Data:
- Supabase PostgreSQL for the new persistent database phase
- Firebase Firestore/Storage remains for legacy exam/syllabus data paths

Server:
- Vercel serverless API routes
- Nodemailer/Gmail SMTP
- Groq AI proxy

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 1 | Real admin authentication + authorization | ✅ implemented; live operator steps may still require verification |
| 2 | Admin UI shell + role-aware navigation + dashboard | ✅ UI complete |
| 3 | Courses / Subjects / Questions UI | ✅ mock/in-memory UI |
| 4 | Leaderboard UI | ✅ mock/in-memory UI |
| 5 | Final admin integration / QA | ⚠️ partial; staff RPC path exists; catalog/leaderboard/feedback persistence now moving into DB phase |
| Database foundation | Courses / Subjects / Feedbacks / Leaderboards designs | ✅ design finalized |
| Static data preparation | Audit and deduplicate JSON/JS datasets before import | 📝 next active task |

## Database state

### Courses

Design finalized:

```text
"Courses"
├── "CourseId"    BIGINT generated identity PK
├── "Sems"        INTEGER[] NOT NULL, max 12 entries
└── "CourseName"  VARCHAR(100) NOT NULL