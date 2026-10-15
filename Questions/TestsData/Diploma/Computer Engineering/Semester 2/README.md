# Diploma Computer Engineering — Semester 2 Exam Bank v2

Canonical exam-type-aware bank for the 7 active Semester 2 subjects (CourseId 44).

## Canonical files

- [exam-bank-v2.json](./exam-bank-v2.json): test rows and metadata mapping.
- [seed-all-v2.sql](./seed-all-v2.sql): staged insert transaction.
- [manifest.json](./manifest.json): per-semester counts and rules.

## Exam rules

| isDepartmentalSubject | Exam type | Format | Variants |
|---|---|---|---:|
| false | Mid 1 | 4 theory questions × 8 marks plus model answers; first 50% syllabus only | 12 |
| false | Mid 2 | 30 MCQs with answer keys | 12 |
| false | ESE | 4 theory questions × 8 marks plus model answers | 12 |
| true | Mid 1 | 30 MCQs with answer keys; first 50% syllabus only | 12 |
| true | Mid 2 | 30 MCQs with answer keys | 12 |
| true | ESE | Not generated | 0 |

Each exam type has four Easy, four Medium and four Hard test variants.

## Current size

- semester: 2
- subjects: 7
- nonDepartmentalSubjects: 5
- departmentalSubjects: 2
- examTypeBanks: 19
- totalTests: 228
- mcqTests: 108
- theoryTests: 120
- mcqQuestions: 3240
- theoryQuestions: 480
- mcqOptionEntries: 12960
- answerEntries: 3720

## Database mapping

The table has only TestId, Questions, Options and Answers. Metadata such as subject, exam type, difficulty and syllabus scope is maintained in the JSON test_index. MCQ rows have 30 questions, 120 flattened A-D options and 30 zero-based keys. Theory rows have four [8 marks] questions, an empty Options array and four model-answer strings in Answers.

The live database is not changed by generating these files. The SQL is staged only; check candidate IDs immediately before running it. This is a draft question bank, not examiner-certified material: review technical correctness, answer keys, distractor plausibility and theory answers before production.
