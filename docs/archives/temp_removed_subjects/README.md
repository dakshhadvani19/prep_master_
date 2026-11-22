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

## Diploma official-syllabus sync — 2026-10-12

- The exact previous Diploma rows that will be removed are archived in `diploma_removed_subjects_2026-10-12.csv` before the Supabase change.
- The reconciled active list is `diploma_catalog_sync_2026-10-12.csv`; it records the current `SubjectId`, source code, semester, official syllabus URL and action for all six Diploma programs.
- The current official Marwadi inventory contains 245 distinct code-level subject rows for Diploma CourseIds 44–49. Duplicate page-code aliases were canonicalized from the linked PDF's own subject title where available.
- An archived row means the current official PDF-backed inventory did not retain its old catalog ID; it does not prove a historical syllabus never existed.

## Project and dissertation deliverable cleanup — 2026-10-30

- Archive: `project_deliverable_subjects_removed_2026-10-30.csv`.
- **46 exact SubjectIds** were archived before removal from live `public."Subjects"` across B.Tech, Diploma, Computer Applications (BCA/MCA), Management Studies, Law & Arts, and Science & Pharmacy.
- The deletion is recorded in Supabase migration `20261030113013_remove_project_deliverable_subjects_from_catalog`.
- Before deletion, the 46 rows had **zero** linked `private.exam_attempts`, **zero** `private.leaderboard_attempt_results`, and **zero** `public."Leaderboards"` snapshots. The migration repeats these checks and aborts if any dependent record is present.
- After deletion, a live query found **zero remaining project/dissertation/research-project deliverable subjects** using the audited title rules. The course-management/theory subjects Project Management, Software Project Management, Construction Project Management, Project Appraisal, Portfolio Management, and Design Engineering and Project Management were intentionally retained.
- The 46 numeric IDs were removed from `src/data/subjectIdBridge.json`, `src/data/subjectSemesterMap.json`, legacy subject entries in `src/data/mockData.js`, and six matching BCA/MCA entries in `src/data/liveSubjectContextOverrides.json`. This prevents the removed numeric exam routes from resolving through old compatibility data.
- The bridge and semester map each now contain 2,452 entries (down from 2,513): 46 live-catalog IDs plus 15 additional legacy-only route IDs were removed. Live Computer Applications overrides now contain 54 entries (down from 60).
- The source syllabus JSON collections under `all_departments_syllabus/` and `public/syllabus/` are retained as reference/archive material. They are not runtime catalog sources; only the live catalog and route mappings were removed.
- Additional activity-/practice-based subjects were **not** deleted. The 58 live occurrences identified for manual assessment-mode review are documented in `non_exam_subjects_for_review_2026-10-30.md`. That list is a title-based screening only, not an official declaration that those subjects have no assessment.

- A further **20 legacy-only project deliverable records** were archived in `legacy_project_subjects_removed_2026-10-30.csv`. These existed only in the older static `mockData.js` subject hierarchy, not in live `public."Subjects"`; 15 had stale numeric bridge entries and five did not have numeric bridge entries. They were removed from `mockData.js` and from any remaining bridge/semester compatibility keys.
- Following both passes, the active legacy mock subject hierarchy has 2,538 nonblank entries, and the numeric bridge/semester map each have 2,452 entries. Academic management/theory subjects with “Project” in their name remain in the hierarchy.
