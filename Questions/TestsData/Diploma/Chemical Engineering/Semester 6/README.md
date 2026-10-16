# Diploma Chemical Engineering — Semester 6 Exam Bank v2

CourseId 46; 4 active subjects.

- [exam-bank-v2.json](./exam-bank-v2.json): canonical question payloads and metadata.
- [seed-all-v2.sql](./seed-all-v2.sql): staged transaction with 132 INSERT statements.
- [manifest.json](./manifest.json): counts, exam rules, and reuse audit.

## Exam structure

- Non-departmental subjects: Mid 1 = four 8-mark theory questions and model answers, restricted to the first 50% of syllabus; Mid 2 = 30 MCQs; ESE = four 8-mark theory questions and model answers.
- Departmental subjects: Mid 1 and Mid 2 = 30 MCQs; no ESE.
- Each exam type has 12 variants: 4 Easy, 4 Medium, 4 Hard.

## Same-name reuse

Per the requested rule, existing Computer Engineering payloads were copied verbatim for **Entrepreneurship Development** and **Project-II**. Questions, options, and answers were not regenerated. Their different syllabus descriptions are recorded in the manifest and bank metadata for review.

## Counts

- semester: 6
- subjects: 4
- reusedSubjects: 2
- newDraftSubjects: 2
- nonDepartmentalSubjects: 3
- departmentalSubjects: 1
- examTypeBanks: 11
- totalTests: 132
- mcqTests: 60
- theoryTests: 72
- mcqQuestions: 1800
- theoryQuestions: 288
- mcqOptionEntries: 7200
- answerEntries: 2088

The seed has not been executed against Supabase. The existing TestsData schema is unchanged. Theory rows use `Options=[]` and model answers in `Answers`; the application must support both row formats. New content still requires academic review, and the two same-name reused subjects should be checked against the Chemical Engineering syllabus before formal assessment use.
