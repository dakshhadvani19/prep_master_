# temp_removed_subjects

This folder preserves B.Tech subject rows temporarily excluded from PrepMaster's live public subject catalog because the supplied Arena recovery ZIP did not contain an acceptable, subject-matched syllabus PDF for them, or because its PDF was falsely labelled as verified after content inspection.

## Recovery run evidence

Arena ZIP summary dated 2026-10-11: 159 manifest rows; 44 labelled VERIFIED_MARWADI; 103 NO_VERIFIED_PUBLIC_PDF; 12 EXPANDED_GROUP; HTTP attempts logged: 0. VERIFIED_MARWADI was independently rejected for four incorrect PDFs. Therefore 'NO_VERIFIED_PUBLIC_PDF' means not present as a verified file in that package, not proof a PDF does not exist online.

The four rejected PDF mappings were:
- B.Tech IT 01IT0501 LINUX ADMINISTRATION: PDF declares Marwadi Diploma/ICT code 09CT0512.
- B.Tech IT 01IT0610 Machine Learning: PDF declares code 04BA0501, Foundations of Machine Learning.
- B.Tech IT 01IT0714 Data Science: PDF declares MBA Business Analytics code 04MB0367.
- B.Tech Mechanical Engineering AI/ML 01ML0503 Machine Learning: PDF declares code 04BA0501, Foundations of Machine Learning.

## Restore policy

Do not restore a row to the public subject catalog until a directly accessible PDF has been validated as matching the program, code/title, and semester. Source priority: Marwadi official PDF, then directly accessible equivalent GTU PDF, then another credible official university syllabus clearly labelled as a comparable reference. Network failures are not evidence that a syllabus does not exist.

## Files

- `removed_subjects_2026-10-11.csv`: pre-deletion snapshot for subjects with an exact live database match. Contains both the Arena target and exact Supabase SubjectId/CourseId fields needed for restoration.
- `unmatched_targets_2026-10-11.csv`: targets with no safe live database row match; these are not deleted.

This is an internal recovery archive, not a public website data source. Do not import these rows back into the live catalog wholesale.
