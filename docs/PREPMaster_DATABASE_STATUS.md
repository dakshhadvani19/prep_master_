# PrepMaster — Database Status

This file is the dedicated reference for PrepMaster's database design, database decisions,
relationships, migration status, and live-verification status.

For general project architecture, read:
- `docs/PREPMaster_PROJECT_CONTEXT.md`
- `docs/PREPMaster_CURRENT_STATUS.md`

---

## 1. Database Platform

PrepMaster uses **Supabase PostgreSQL** for the new persistent database layer.

The database design follows the SRS and ER diagram.

### SRS → PostgreSQL type mapping

| SRS type | PostgreSQL type |
|---|---|
| Long 64 | BIGINT |
| String N | VARCHAR(N) |
| Boolean | BOOLEAN |
| Array | PostgreSQL ARRAY where appropriate |
| Timestamp | TIMESTAMPTZ / TIMESTAMP where explicitly decided |

Important rule:

**Do not invent additional columns just because they may be useful in the application.**

The SRS/ER structure and explicit owner decisions are the authority.

---

# 2. Database Naming Rule

For the new database tables, identifiers should match the SRS exactly.

Examples:

```text
"Courses"
"CourseId"
"Sems"
"CourseName"

"Subjects"
"SubjectId"
"SubjectName"
"CourseId"

"Feedbacks"
"FeedbackId"
"Description"
"Type"
"isSpam"
"isBookmark"
"isSeen"
"StudentId"

"Leaderboards"
"LeaderboardId"
"StudentId"
"Points"
"SubjectId"
"TotalTests"