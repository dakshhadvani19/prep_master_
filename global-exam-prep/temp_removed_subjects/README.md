# temp_removed_subjects

This folder preserves B.Tech subject rows temporarily excluded from PrepMaster's live public subject catalog because the supplied Arena recovery ZIP did not contain an acceptable, subject-matched syllabus PDF for them, or because its PDF was falsely labelled as verified after content inspection.

## Recovery run evidence

Arena ZIP summary dated 2026-10-11: 159 manifest rows; 44 labelled VERIFIED_MARWADI; 103 NO_VERIFIED_PUBLIC_PDF; 12 EXPANDED_GROUP; HTTP attempts logged: 0. VERIFIED_MARWADI was independently rejected for four incorrect PDFs. Therefore 'NO_VERIFIED_PUBLIC_PDF' means not present as a verified file in that package, not proof a PDF does not exist online.

The four rejected PDF mappings were:
- B.Tech IT 01IT0501 LINUX ADMINISTRATION: PDF declares Marwadi Diploma/ICT code 09CT0512.
- B.Tech IT 01IT0610 Machine Learning: PDF declares code 04BA0501, Foundations of Machine Learning.
- B.Tech IT 01IT0714 Data Science: PDF declares MBA Business Analytics code 04MB0367.
- B.Tech Mechanical Engineering AI/ML 01ML0503 Machine Learning: PDF declares code 04BA0501, Foundations of Machine Learning.

## Live database action\n\n- 106 exact rows were deleted from live `public.Subjects` only after this archive was committed.\n- Verification after deletion found zero of those 106 SubjectIds remaining.\n- The mapping counts after cleanup are CourseId 2 = 26, 14 = 38, 15 = 32, 16 = 49, 17 = 50.\n- The 106 deleted IDs were also removed from `subjectIdBridge.json` and `subjectSemesterMap.json` so numeric exam routes do not resolve archived numeric IDs.\n\n## Restore policy

Do not restore a row to the public subject catalog until a directly accessible PDF has been validated as matching the program, code/title, and semester. Source priority: Marwadi official PDF, then directly accessible equivalent GTU PDF, then another credible official university syllabus clearly labelled as a comparable reference. Network failures are not evidence that a syllabus does not exist.

## Files

- `removed_subjects_2026-10-11.csv`: snapshot for subjects with an exact live database match; `database_action` is set to `DELETED_VERIFIED`. Contains both the Arena target and exact Supabase SubjectId/CourseId fields needed for restoration.
- `unmatched_targets_2026-10-11.csv`: targets with no safe live database row match; these are not deleted.

This is an internal recovery archive, not a public website data source. Do not import these rows back into the live catalog wholesale.


## Law & Arts recovery audit — 2026-10-11

- `law_arts_removed_subjects_2026-10-11.csv` preserves 88 questionable/unusable catalog occurrences with source SubjectId, course, semester, audit classification, and restoration metadata. Of these, 74 were present as live Supabase rows and are archived before temporary exclusion; 14 blank-title rows were already absent from Supabase.
- `law_arts_network_retry_pending_2026-10-11.csv` lists 33 occurrences across 19 unique titles that hit network/access failures. These remain live and must be retried; network failure is not proof that a syllabus does not exist.
- PDF title fragments, cross-course title ambiguity, duplicate-content false positives, and generic labels were not treated as verified one-to-one subject matches. Restore or update rows only after the source title and course-specific syllabus are confirmed.

## Management Studies recovery cleanup — 2026-10-11

- Archive: `management_studies_removed_subjects_2026-10-11.csv`.
- The recovery run marked 74 unique normalized Management Studies subject titles as `FAILED_NO_MATCHING_OFFICIAL_PDF`, covering 122 course/semester occurrences. The exact 122 live Supabase rows are preserved in the archive with their original `SubjectId`, `SubjectName`, `CourseId`, `CourseName`, and `Semester`.
- The records are temporarily excluded under the user's direction after this recovery run. This status reflects the run result only, not proof that a syllabus does not exist: the report recorded HTTP 429 rate limits and zero candidate-download attempts for some failed titles.
- The same 122 IDs are removed from `src/data/subjectIdBridge.json`, `src/data/subjectSemesterMap.json`, and the legacy subject arrays in `src/data/mockData.js` to prevent stale numeric exam routes from resolving them.
- Restore only after a directly accessible syllabus is validated against the applicable course/program, subject code/title, and semester. Retry sources in priority order: official Marwadi University, GTU, then another credible official university for clearly-labelled comparable references.



## Diploma syllabus catalog sync — 2026-10-12

- Source: the live Marwadi official Diploma program pages and the checked-in collector inventory/PDF validation manifest under `Syllabus/Diploma_Full_Collection_1/Marwadi_Official_Diploma_Collector/Marwadi_Diploma_Syllabus_Collection/Reports/`.
- The inventory has 292 parsed occurrences. After deduplicating by course + subject code and rejecting labels contradicted by the PDF's internal title, 240 unique course/code candidates remain. Two Applied Chemistry records (`09GS3102`, Diploma Computer Engineering and Diploma Electrical Engineering) are **not inserted** because their PDF says Semester I/II without a program-specific semester; see `diploma_semester_review_pending_2026-10-12.csv`.
- Active manifest: `diploma_active_syllabus_catalog_2026-10-12.csv` (238 program-specific, verified, semester-resolved rows). Source records are limited to Marwadi official PDFs; no GTU or other-university fallback is used in this pass.
- Removal archive: `diploma_removed_subjects_2026-10-12.csv` (99 previous live rows no longer mapped to a current verified course/code entry). These rows are archived before deletion from Supabase. Where a current code/title replacement was identified, the replacement ID and PDF URL are recorded; other rows remain archived for future review.
- Primary key convention verified from current live rows: `SubjectId = CourseId || LPAD((subject code with each letter converted to its 1-based alphabet number, followed by "01"), 12, '0')`. Example: CourseId 44 + code `09CE2101` gives `44000935210101`. The generated IDs are checked for collisions before insertion.
- Compatibility files `src/data/subjectIdBridge.json`, `src/data/subjectSemesterMap.json`, and the static Diploma subject arrays must match the final active catalog. The two pending Applied Chemistry entries remain excluded until the intended program semester is confirmed. A network or source-label failure is not treated as proof that the syllabus does not exist.
