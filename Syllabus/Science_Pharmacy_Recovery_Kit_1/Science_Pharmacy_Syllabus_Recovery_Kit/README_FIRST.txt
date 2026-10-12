PREPMASTER — SCIENCE & PHARMACY SYLLABUS RECOVERY KIT
====================================================

PURPOSE
This Windows runner searches for and downloads real syllabus PDFs for the Science & Pharmacy department in PrepMaster. It validates the actual PDF bytes, readable text, subject-title evidence, syllabus content, and course-code evidence when available. It writes local PDF files and audit reports only.

IT DOES NOT write to Supabase, GitHub, the live website, or any catalog JSON. Do not use it as an automatic deletion tool.

HOW TO RUN
1. Extract the entire ZIP to a normal folder, for example Downloads\Science_Pharmacy_Syllabus_Recovery_Kit.
2. Ensure Python 3.10 or newer is installed on Windows. During Python installation, select “Add Python to PATH”.
3. Double-click RUN_SCIENCE_PHARMACY_RECOVERY.bat.
4. Allow it to create an isolated .venv and install the pinned packages. It will not replace packages in your global Python installation.
5. Keep the terminal window open while it searches. At the end, open Output\RUN_SUMMARY.txt first.
6. The real PDFs and all reports are collected in Output\Science_Pharmacy_Syllabus_Collection_Output.zip. The PDFs are also saved into Output\Verified_PDFs\Tier_1, Tier_2, and Tier_3.

For a preflight check without any network search, run RUN_PREFLIGHT_ONLY.bat.

SUBJECT SCOPE FROM THE CURRENT CATALOG SNAPSHOT
The source file is fetched again from GitHub main every run, so these counts may change later.
- Department/domain: Science & Pharmacy (science-pharmacy)
- Courses: 10
- Subject/course-semester occurrences in the snapshot: 306
- Unique normalized title groups: 250
- Duplicate-title groups: 36
- Blank-title occurrences: 2
- Searchable nonblank title groups in this snapshot: 249

Courses covered:
- B.Sc in Chemistry
- B.Sc in Microbiology
- B.Sc in Agricultural Honors
- M.Sc in Chemistry
- M.Sc in MicorBiology
- M.Sc in PGDMLT (as named in the catalog)
- B.Pharm
- M.Pharm Pharmaceutics
- M.Pharm Pharmaceutical Quality Assurence (catalog spelling)
- M.Pharm Regulatory Affairs

SOURCE ORDER
Tier 1: Official Marwadi University program pages and PDFs for all 10 course IDs.
Tier 2: Official Gujarat/Saurashtra universities, Gujarat Technological University, and Gujarat agricultural universities.
Tier 3: Official Pharmacy Council of India, ICAR, and other allowlisted official university/education sites.

A PDF from a fallback university/regulator is clearly labelled as a comparable reference; it is not silently represented as a Marwadi University syllabus. Search engine pages are used only to discover source URLs. Candidate PDFs are accepted only from the official host allowlist.

VALIDATION / LIMITATIONS
- The downloader checks for a real PDF signature, PDF parser success, extractable text, a subject-title match, syllabus-content indicators, course-detail indicators and course-code evidence when found on Marwadi's program page.
- The catalog contains a few short/incomplete-looking titles. Such results are deliberately hard to accept: short titles need a standalone subject heading near the beginning of the PDF, and an observed course-code conflict is rejected.
- A matching title alone cannot prove that one syllabus covers every course using the same title. Check duplicate_subject_titles.csv and subject_occurrence_report.csv for course/semester-level warnings.
- Scanned/image-only PDFs that do not provide extractable text may be rejected for manual inspection, even if the document is a legitimate syllabus.
- Google, Bing, or university websites may throttle or block automated access. NETWORK_UNVERIFIED_RETRY and PROCESSING_ERROR_RETRY mean “retry/manual check required”; they are not proof the syllabus is unavailable.
- FAILED_NO_MATCHING_OFFICIAL_PDF means no acceptable candidate was found among accessible sources in this run. It does not prove no syllabus exists online.
- Blank catalog titles are skipped because there is no defensible title to search. Their source IDs are listed in catalog_data_quality_exclusions.csv.
- IDs read from mockData.js are source catalog IDs. Do not assume they are Supabase SubjectId values and never delete database rows by using the downloader's source IDs.

REPORTS IN Output
- RUN_SUMMARY.txt — counts, statuses, source order, warnings, and result summary.
- unique_download_list.csv — one row per unique normalized title, final status, PDF path, source and checksum.
- subject_occurrence_report.csv — maps results back to every source course, subject ID and semester.
- duplicate_subject_titles.csv — duplicate titles, course/code evidence and cross-course scope warnings.
- failed_subjects.csv — everything not verified as an accepted PDF.
- catalog_data_quality_exclusions.csv — blank or generic titles excluded from search.
- pdf_validation_report.csv — each downloaded candidate and why it passed/failed validation.
- source_attempts.csv — HTTP attempts and URLs.
- network_failures.csv — access/network errors to retry.
- source_catalog.csv — allowed sources and their intended role.
- source_occurrences_snapshot.csv and source_manifest_metadata.json — exact catalog snapshot metadata for this run.

SAFETY RULE
Review PDFs and CSVs before deciding to retain/remove any live PrepMaster subjects. This package performs no database or GitHub writes and does not archive/delete subjects automatically.


CURRENT CURATED COLLECTION (2026-10-12)
---------------------------------------
- The active verified tier has been curated to 102 PDF files after removing three wrong-course/wrong-semester duplicate copies and moving two course-scope false positives to `Output/Review_Required/`.
- Use `Output/ACTIVE_PDF_MANIFEST.csv` as the course/subject/semester mapping for development and question generation. It has one row for every current Science & Pharmacy subject occurrence.
- Only rows whose `question_generation_use` begins with `YES_` should be considered for automatic question generation. `NO_` rows are unresolved, mismatched, invalid, or explicitly pending review.
- The original validation and occurrence reports are retained as evidence of the pre-cleanup run; some historical rows may refer to moved/deleted PDF paths.
- Network-unverified titles stay unresolved; blocked access is not proof that no syllabus exists.
