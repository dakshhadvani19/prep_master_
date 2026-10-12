PREPMASTER — MANAGEMENT STUDIES SYLLABUS RECOVERY KIT

PURPOSE
Searches for syllabus PDFs for the Management Studies courses listed in PrepMaster's current
GitHub source catalog. It downloads real PDFs, validates their structure and subject text, and
writes detailed success/failure/duplicate reports. It does not modify Supabase, GitHub, or the
website catalog. Do not remove or restore any database subject automatically from these reports.

RUN
1. Extract the entire ZIP to a normal folder, for example Downloads\Management_Studies_Syllabus_Recovery_Kit.
2. Keep RUN_MANAGEMENT_RECOVERY.bat, RUN_PREFLIGHT_ONLY.bat, management_syllabus_recovery.py, requirements.txt, and data\ together.
3. Double-click RUN_MANAGEMENT_RECOVERY.bat. It creates an isolated `.venv` folder (so it does not
   replace globally installed Python packages), installs pinned dependencies there, runs offline
   preflight tests, fetches the catalog from the PrepMaster main branch, then searches/downloads PDFs.
4. Wait for the console to say recovery completed. Do not close the window while it runs.
5. Open Output\RUN_SUMMARY.txt. The finished result archive is Output\Management_Studies_Syllabus_Collection_Output.zip.
6. Upload that output ZIP here so PDF-to-subject matches and the keep/remove review can be audited
   before any DB/GitHub changes.

SUBJECT SCOPE
- The subject list is read from PrepMaster's current `global-exam-prep/src/data/mockData.js` Management
  Studies domain. The runner reads each course's `subjects` list. It intentionally ignores `scenarios`,
  because those are scenario/example definitions rather than counted catalog subject rows.
- Each distinct normalized subject title is queued once, even if it occurs in several courses/semesters.
- All original course/subject-ID/semester occurrences remain in the reports.
- Some same-name subjects may have different course codes or syllabi. The reports flag these instead of
  implying that one PDF automatically validates every occurrence.

SOURCE PRIORITY
1. Marwadi University official course pages and official WordPress media/PDF links.
2. Direct, title-matched PDFs hosted by the official Gujarat Technological University domain.
3. Direct, title-matched PDFs hosted by the official university domains configured in the script; these
   are labelled comparable references, not Marwadi syllabi.
Search-engine result pages are discovery only and are never themselves counted as syllabus PDFs.
A PDF must be directly fetched, open in PyMuPDF, contain sufficient text, match the subject title, and
contain syllabus/course-content markers. Where official course pages expose a course code, conflicting
course codes cause the candidate to be rejected.

REPORTS (inside Output and inside the final output ZIP)
- unique_download_list.csv: one row per unique title, chosen PDF, source tier, status and validation note.
- duplicate_subject_titles.csv: normalized duplicate groups, course names, semesters, IDs and selected PDF.
- subject_occurrence_report.csv: every catalog occurrence with the shared title result and course-specific
  code/coverage warning.
- failed_subjects.csv: unique titles not verified, separated into no matching PDF vs network/access retry.
- pdf_validation_report.csv: candidate URLs, response status, PDF structure, extracted text preview, title
  match, expected codes, detected codes, validation decision and SHA-256.
- source_attempts.csv: all source and HTTP requests plus errors.
- network_failures.csv: transient connectivity/access failures. These do NOT mean a syllabus is missing.
- source_manifest_metadata.json: source URL, hash, counts and run time.
- source_occurrences_snapshot.csv: exact course/subject ID/title/semester snapshot used for the run.
- run_log.txt and RUN_SUMMARY.txt: readable run progress and overall outcome.

IMPORTANT STATUS MEANINGS
- VERIFIED_MARWADI: a syllabus PDF from an official Marwadi source passed title/content checks.
- VERIFIED_GTU_COMPARABLE: an official GTU reference passed checks; it is not the Marwadi file.
- VERIFIED_OTHER_OFFICIAL_COMPARABLE: a reference from another configured official university passed checks.
- FAILED_NO_MATCHING_OFFICIAL_PDF: none of the accessible, searched sources produced an acceptable PDF in this run;
  it is not proof no syllabus exists online.
- NETWORK_UNVERIFIED_RETRY / PROCESSING_ERROR_RETRY: do not use to conclude that a subject should be removed.
- DUPLICATE_TITLE_* occurrence status: the unique-name PDF was not established as a valid syllabus for every
  distinct program-code variant; inspect the duplicate report before a database decision.

DUPLICATE-DOWNLOAD POLICY
One PDF is attempted per normalized subject name to save time. Duplicate rows are not erased; they are
listed by course/semester/subject ID. If a single file matches one course's code but not another's, the
occurrence report identifies that difference so the later review can decide whether a second program-specific
PDF is justified.

PRE-FLIGHT
Double-click RUN_PREFLIGHT_ONLY.bat, or run `py -3 management_syllabus_recovery.py --self-test`.
The self-test uses a tiny generated in-memory PDF; it does not download syllabus PDFs or write to GitHub/DB.

ISOLATION AND SAFETY
- Dependencies are installed into the kit-local `.venv`; the batch file does not uninstall/update packages in your global Python environment.
- The runner is read-only with respect to GitHub, Supabase, and the website. It fetches the subject list from GitHub but does not upload or update any files there.
- The output catalog keys `source_course_id` and `source_subject_id` come from `mockData.js`. They are NOT guaranteed to be the live numeric `CourseId` or `SubjectId` in Supabase. Do not issue delete/restore operations by using those strings as live database IDs.
- Duplicate handling avoids repeating a title-level search/download. The report keeps every original course, semester, and source subject ID. A single file may still fail to verify all course variants, which will be flagged rather than hidden.
