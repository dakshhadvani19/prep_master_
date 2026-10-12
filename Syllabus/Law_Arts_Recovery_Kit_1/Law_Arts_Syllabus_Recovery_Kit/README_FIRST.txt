PREPMASTER — LAW & ARTS SYLLABUS RECOVERY KIT

GOAL
Download real, title-matched syllabus PDFs for the current `law-arts` domain of PrepMaster's GitHub catalog. Generate a PDF collection ZIP and detailed reports. The runner does not change Supabase, GitHub, or the live website.

RUN
1. Extract the ZIP into a new folder.
2. Double-click RUN_LAW_ARTS_RECOVERY.bat.
3. The batch file creates an isolated `.venv` environment, installs pinned dependencies, runs offline tests, fetches the live catalog, then collects PDFs. Global Python packages are not changed.
4. Leave the terminal open until it prints that the run is finished.
5. Find the actual PDFs and reports in `Output`. The finished archive is `Output\Law_Arts_Syllabus_Collection_Output.zip`.
6. Upload that output ZIP here for audit before using its results to decide which live database subjects to keep/remove.

SUBJECT SOURCE AND DEDUPLICATION
- At run time, the runner fetches `global-exam-prep/src/data/mockData.js` from the PrepMaster main branch and selects the `law-arts` domain.
- It reads `subjects`, not `scenarios`.
- One download attempt is made per normalized title, reducing repeated downloads.
- Every `source_course_id`, `source_subject_id`, semester and course name remains in `subject_occurrence_report.csv` and `duplicate_subject_titles.csv`.
- Blank subjects and generic titles such as `Course` are not sent to source search; they are recorded in `catalog_data_quality_exclusions.csv` for catalog correction.
- One PDF with the right title may not apply to every program. Course-code evidence is gathered from official Marwadi pages where possible; course-specific mismatches are flagged.

SOURCE ORDER
1. Marwadi University official pages/PDFs, including official WordPress media results.
2. Gujarat University and Saurashtra University official sources. GTU is not used as the primary fallback for this department because its normal syllabus catalogue is technology/engineering-focused; regional universities are more relevant for law and arts.
3. Selected official Indian university sources (University of Delhi, IGNOU, Jamia Millia Islamia, BHU and Sardar Patel University domains).

A programme page or search result is discovery only, not a downloadable syllabus. The program must download a direct PDF from an allowed institution domain, open it with PyMuPDF, find the exact/strong subject title in extracted PDF text, and find syllabus/content plus course-detail markers. A code conflict against course-specific evidence is rejected. If no acceptable PDF is found, it stays failed; if the network/access check fails, it is marked retryable instead of being treated as confirmed absence.

OUTPUT REPORTS
- `unique_download_list.csv`: one result for every normalized title.
- `duplicate_subject_titles.csv`: duplicate names across courses/semesters/source subject IDs and selected PDF candidate.
- `subject_occurrence_report.csv`: every subject occurrence with code-scope warnings.
- `failed_subjects.csv`: all non-verified titles and their statuses.
- `catalog_data_quality_exclusions.csv`: blank/generic catalog titles that must be corrected before a reliable PDF search.
- `pdf_validation_report.csv`: candidate URL, HTTP status, PDF parsing result, matched title, page count, SHA-256 and reason.
- `source_attempts.csv`: URLs accessed during discovery/download and HTTP outcomes.
- `network_failures.csv`: transient request/access/processing issues; not evidence a syllabus is missing.
- `source_manifest_metadata.json`: actual source URL and source content SHA-256.
- `source_occurrences_snapshot.csv`: catalog subject rows used in this run.
- `RUN_SUMMARY.txt` and `run_log.txt`: readable summary and progress log.

STATUS MEANINGS
- `VERIFIED_MARWADI`: PDF from an official Marwadi host passed PDF/title/content checks.
- `VERIFIED_GUJARAT_UNIVERSITY_COMPARABLE`: verified content match from an official Gujarat/Saurashtra University source; not Marwadi's own syllabus.
- `VERIFIED_OTHER_OFFICIAL_COMPARABLE`: verified reference from another official university; not Marwadi's own syllabus.
- `FAILED_NO_MATCHING_OFFICIAL_PDF`: no acceptable PDF was found in accessible sources during this run; not proof none exists anywhere.
- `NETWORK_UNVERIFIED_RETRY`: source could not be checked because of connection, access or search blocking. Do not remove a subject based on this status alone.
- `EXCLUDED_INVALID_CATALOG_TITLE`: blank or generic title such as `Course`; this indicates catalog data needs repair, not that an actual academic subject was confirmed missing.
- `PROCESSING_ERROR_RETRY`: record not verified due to a processing error; retry/fix before making a data decision.

DATABASE/GITHUB SAFETY
This package performs only public GET requests. It has no Supabase key, GitHub token, DELETE, PATCH, POST or repository write logic. Source IDs from mockData.js are not guaranteed to be live numeric Supabase `SubjectId`/`CourseId` values. Never use them directly for database deletion. After reviewing the output, use a separately approved migration/script to archive real removed rows under `temp_removed_subjects` while preserving their full mappings; do not delete automatically from this recovery runner.

PREFLIGHT
Double-click RUN_PREFLIGHT_ONLY.bat or run `py -3 law_arts_syllabus_recovery.py --self-test`. This tests parsing, title deduplication, generic-title exclusion, source-host protection, a generated valid PDF, and an unrelated-PDF rejection. It does not download syllabus PDFs.
