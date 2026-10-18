# Diploma Information and Communication Technology — Exam Bank

- One canonical `exam-bank-v2.json` per semester stores all TestsData row payloads and the `test_index` metadata.
- Per-subject folders contain `Mid 1.json`, `Mid 2.json`, and (for non-departmental subjects only) `ESE.json` files that index the 12 variants in the canonical bank.
- Each exam type has four Easy, four Medium, and four Hard variants.
- Mid 1 uses an ordered first-half syllabus scope derived from unit order/contact hours where available.
- Duplicate subject names reuse source payloads from existing departments verbatim when exam formats are compatible.
- Project I and Project-II are excluded entirely from exam generation.
- Communication Skills-I is blocked pending review because ICT's departmental flag conflicts with the existing same-name source exam formats.
- New question pools/model answers are deterministic template-generated drafts and require academic QA before production.
- `seed-all-v2.sql` files are staged only; no Supabase inserts or schema changes are performed.
