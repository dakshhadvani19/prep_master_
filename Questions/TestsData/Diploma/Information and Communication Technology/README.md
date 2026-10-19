> **Archive status (2026-10-19):** The semester banks now retain one representative test per subject/exam type (about 8.3% of the former test variants) to keep repository context compact for future Groq generation. These are examples only, not complete production banks or academically approved answer keys. See [the generation instructions](../../../../docs/EXAM_QUESTION_GENERATION_INSTRUCTIONS.md). Any inventory counts below describe the pre-compaction bank; use each semester's `manifest.json` for retained counts.

# Information and Communication Technology — Compact Reference Question Archive

- One canonical `exam-bank-v2.json` per semester stores all TestsData row payloads and the `test_index` metadata.
- Per-subject folders contain `Mid 1.json`, `Mid 2.json`, and (for non-departmental subjects only) `ESE.json` files that index the 12 variants in the canonical bank.
- Each exam type has four Easy, four Medium, and four Hard variants.
- Mid 1 uses an ordered first-half syllabus scope derived from unit order/contact hours where available.
- Duplicate subject names reuse source payloads from existing departments verbatim when exam formats are compatible.
- Project I and Project-II are excluded entirely from exam generation.
- Communication Skills-I is blocked pending review because ICT's departmental flag conflicts with the existing same-name source exam formats.
- New question pools/model answers are deterministic template-generated drafts and require academic QA before production.
- `seed-all-v2.sql` files are staged only; no Supabase inserts or schema changes are performed.

## Current coverage (2026-10-18)

- Semester 1: 4 banked subjects; 1 exact-name duplicate conflict (`Communication Skills-I`) is blocked from regeneration and documented in its manifest.
- Semester 2: 6 banked subjects.
- Semester 3: no active subjects; an empty bank and manifest document this catalog state.
- Semester 4: 6 banked subjects.
- Semester 5: 13 banked subjects; `Project I` excluded.
- Semester 6: 11 banked subjects; `Project-II` excluded.
- Total: 40 subjects banked, 112 exam-type banks and 1,344 test rows.
- Compatible exact-name duplicate subjects copy question, option and answer payloads verbatim; new content is template-generated draft material requiring academic review.
- Seed SQL is staged only; no Supabase records or schema were modified.
