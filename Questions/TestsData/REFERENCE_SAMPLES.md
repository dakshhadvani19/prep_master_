# Retained Question Reference Samples

**Status: reference examples only; not approved for production exams.** Last updated 2026-10-19.

The original generated draft bank has been reduced to one retained variant per available non-project subject/exam type (typically one of the previous twelve variants). Project and internship exams are excluded. The remaining payloads provide schema and prompt examples only; academic correctness has not been fully verified.

Use [`docs/EXAM_FORMAT_AND_MARKING_RULES.md`](../../docs/EXAM_FORMAT_AND_MARKING_RULES.md) for the current MCQ structure, theory marks, coding questions, and runtime-generation rules. Some retained theory samples still use four 8-mark questions (32 marks total); they are legacy examples, not compliant current exams.

## Retained bank sizes

| Course | Semester | Original variants | Reference variants retained | MCQ tests | Theory tests | Retained question entries |
|---|---:|---:|---:|---:|---:|---:|
| Diploma Chemical Engineering | 1 | 252 | 21 | 11 | 10 | 370 |
| Diploma Chemical Engineering | 2 | 216 | 18 | 10 | 8 | 332 |
| Diploma Chemical Engineering | 3 | 168 | 14 | 6 | 8 | 212 |
| Diploma Chemical Engineering | 4 | 192 | 16 | 8 | 8 | 272 |
| Diploma Chemical Engineering | 5 | 252 | 17 | 7 | 10 | 250 |
| Diploma Chemical Engineering | 6 | 132 | 9 | 3 | 6 | 114 |
| Diploma Computer Engineering | 1 | 252 | 21 | 11 | 10 | 370 |
| Diploma Computer Engineering | 2 | 228 | 19 | 9 | 10 | 310 |
| Diploma Computer Engineering | 3 | 204 | 17 | 7 | 10 | 250 |
| Diploma Computer Engineering | 4 | 192 | 16 | 8 | 8 | 272 |
| Diploma Computer Engineering | 5 | 204 | 13 | 7 | 6 | 234 |
| Diploma Computer Engineering | 6 | 156 | 11 | 5 | 6 | 174 |
| Diploma Information and Communication Technology | 1 | 132 | 11 | 5 | 6 | 174 |
| Diploma Information and Communication Technology | 2 | 180 | 15 | 9 | 6 | 294 |
| Diploma Information and Communication Technology | 3 | 0 | 0 | 0 | 0 | 0 |
| Diploma Information and Communication Technology | 4 | 180 | 15 | 9 | 6 | 294 |
| Diploma Information and Communication Technology | 5 | 456 | 38 | 14 | 24 | 516 |
| Diploma Information and Communication Technology | 6 | 396 | 33 | 11 | 22 | 418 |
| **Total** | — | **3792** | **304** | **140** | **164** | **4856** |

The retained bank keeps 8.0% of the prior test variants and 7.8% of question entries. These are retention statistics only; they do not certify quality.

## Examples retained

- **MCQ:** Retained examples preserve 30 questions, 120 flattened A–D option entries, and 30 zero-based answer indices (`0=A`, `1=B`, `2=C`, `3=D`). Structural validity is not academic certification.
- **Theory/ESE:** One example remains for each available non-project subject/exam type. Legacy 4 × 8 = 32-mark samples are explicitly noted in the reference map and must not be used as the current format.
- **Code/practical-style signals:** 94 retained samples were selected using basic code/program/debug/output or syntax signals. This is a selection heuristic; inspect the mapped question before reusing it.
- **ICT Semester 3:** The repository's original canonical bank was an empty stub, so no tests were invented.

## What the map contains

`REFERENCE_SAMPLE_MAP.json` records the retained `TestId`, course, semester, subject, exam type, difficulty, format, question/options/answer counts, syllabus scope, and reference-only warning. Canonical payloads remain in each semester's `exam-bank-v2.json`.

## Cleanup status

- One reference variant per available subject/exam type remains in the canonical semester banks, preserving its original `TestId`.
- Subject-level exam descriptor files are pointers to the central map rather than stale lists of 12 variants.
- The oversized `answer-review-v2.json` pools have been reduced to about 10% of each generated pool's items.
- Full `seed-all-v2.sql` files are replaced with comment-only no-op files; they contain no `INSERT` statements.
- Old per-subject 10-question dumps, redundant standalone seeds and stale review companions are queued for removal in the final cleanup pass.
- No Supabase tables, records, policies or functions were changed.
