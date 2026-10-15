# Diploma Computer Engineering — Semester 5 Exam Bank v2

Canonical exam-aware bank for 7 active Semester 5 subjects (CourseId 44).

- [exam-bank-v2.json](./exam-bank-v2.json): canonical rows and metadata.
- [seed-all-v2.sql](./seed-all-v2.sql): staged transaction.
- [manifest.json](./manifest.json): counts and rules.

## Exam rules
- `isDepartmentalSubject=false`: Mid 1 = four 8-mark theory questions and model answers (first half); Mid 2 = 30 MCQs; ESE = four 8-mark theory questions and model answers.
- `isDepartmentalSubject=true`: Mid 1 = 30 MCQs (first half); Mid 2 = 30 MCQs; no ESE.
- Each available exam type has 12 variants: 4 Easy, 4 Medium, 4 Hard.

## Counts
- semester: 5
- subjects: 7
- nonDepartmentalSubjects: 3
- departmentalSubjects: 4
- examTypeBanks: 17
- totalTests: 204
- mcqTests: 132
- theoryTests: 72
- mcqQuestions: 3960
- theoryQuestions: 288
- mcqOptionEntries: 15840
- answerEntries: 4248

The live table has only TestId, Questions, Options and Answers; all other metadata is in JSON test_index. Theory rows use Options=[] and model answers in Answers, so the consumer must handle theory explicitly. This is a staged draft, not an insertion or academic certification.
