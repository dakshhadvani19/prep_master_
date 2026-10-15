# Diploma Computer Engineering — Semester 6 Exam Bank v2

Canonical exam-aware bank for 5 active Semester 6 subjects (CourseId 44).

- [exam-bank-v2.json](./exam-bank-v2.json): canonical rows and metadata.
- [seed-all-v2.sql](./seed-all-v2.sql): staged transaction.
- [manifest.json](./manifest.json): counts and rules.

## Exam rules
- `isDepartmentalSubject=false`: Mid 1 = four 8-mark theory questions with model answers (first half); Mid 2 = 30 MCQs; ESE = four 8-mark theory questions with model answers.
- `isDepartmentalSubject=true`: Mid 1 = 30 MCQs (first half); Mid 2 = 30 MCQs; no ESE.
- Each available exam type has 12 variants: 4 Easy, 4 Medium, 4 Hard.

## Counts
- semester: 6
- subjects: 5
- nonDepartmentalSubjects: 3
- departmentalSubjects: 2
- examTypeBanks: 13
- totalTests: 156
- mcqTests: 84
- theoryTests: 72
- mcqQuestions: 2520
- theoryQuestions: 288
- mcqOptionEntries: 10080
- answerEntries: 2808

TestsData has only TestId, Questions, Options and Answers. Additional metadata is in the JSON test_index. Theory rows use Options=[] and model answers in Answers. This export has not been inserted and requires academic review before production.
