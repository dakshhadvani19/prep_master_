# Science & Pharmacy syllabus collection cleanup

Updated: 2026-10-12  
Scope: `Syllabus/Science_Pharmacy_Recovery_Kit_1/Science_Pharmacy_Syllabus_Recovery_Kit/`

## Retained collection

- The 2026-10-11 run produced 107 PDF files.
- The current Science & Pharmacy catalog has 306 subject/course/semester occurrences across 250 normalized title groups.
- The active `Verified_PDFs/Tier_1` folder retains 102 PDFs.
- Two candidate PDFs were moved to `Output/Review_Required/` because course-code/source-scope evidence does not support using them as verified syllabi.
- Three mislabeled or wrong-semester duplicate copies were deleted from the active collection.
- All 163 `NETWORK_UNVERIFIED_RETRY` occurrences and the underlying subject records remain unresolved; no inference of syllabus absence is made.

## PDFs removed from active collection

- `Human Anatomy and Physiology I [031116359caa].pdf` — B.Pharm label points to an exact byte-identical PGDMLT Human Anatomy and Physiology syllabus (02ML0104), so this duplicate was removed from the active syllabus set.
- `Quality Assurance Practical-2 [172bc448b41c].pdf` — Exact duplicate of Quality Assurance Practical-1 from 13MQ0105; no course-code or semester evidence supports using the Practical-1 PDF for semester 2.
- `Regulatory Affairs Practical-2 [c041d463a585].pdf` — Exact duplicate of Regulatory Affairs Practical-1 from 13MR0105; no course-code or semester evidence supports using the Practical-1 PDF for semester 2.

## PDFs moved to manual review

- `Biochemistry [11823e834222].pdf` — Biochemistry was sourced from a PDF named BIOCHEMISTRY-BPT-103 and extracted pages did not expose the expected B.Pharm/M.Sc Microbiology course code. Moved out of the verified tier pending course-specific review.
- `Basic and Clinical Pathology [b0f0aa95f376].pdf` — The PDF's opening heading identifies PG DMLT Semester I Basic and Clinical Pathology (02ML0101), while the catalog code evidence only overlaps part of the broader expected-code list. Moved out of the verified tier until the exact course-code/syllabus scope is confirmed.

These files are intentionally outside `Verified_PDFs/Tier_1` and must not be consumed automatically for question generation until the exact program/course code and semester are confirmed.

## M.Pharm course-code handling

Several subjects share the same title across M.Pharm specializations. The official URLs returned for the selected files use `13MC` codes. Such PDFs are retained for the matching Pharmaceutics occurrence when supported, while the `13MQ` Quality Assurance and `13MR` Regulatory Affairs occurrences remain explicitly marked `COURSE_CODE_MISMATCH_REVIEW` in the active manifest. The report's 13 course-code mismatch occurrences are not mapped to an approved PDF for automatic use.

## Output reports

Deleted redundant first-pass/transient files:
- `duplicate_subject_titles_initial.csv`
- `unique_download_list_initial.csv`
- `run_log.txt`
- `source_attempts.csv`

Retained current/historical audit evidence:
- `RUN_SUMMARY.txt`
- `unique_download_list.csv`
- `subject_occurrence_report.csv`
- `duplicate_subject_titles.csv`
- `failed_subjects.csv`
- `catalog_data_quality_exclusions.csv`
- `pdf_validation_report.csv`
- `network_failures.csv`
- `source_catalog.csv`
- `source_manifest_metadata.json`
- `source_occurrences_snapshot.csv`

The retained reports describe the original run and may mention PDF paths changed by this cleanup. Use `ACTIVE_PDF_MANIFEST.csv` as the current operational mapping.

## Question-generation rule

Use the `question_generation_use` column in `ACTIVE_PDF_MANIFEST.csv`.
- `YES_CODE_MATCH`: title/content and course-specific code match are documented.
- `YES_TITLE_MATCH_CODE_NOT_VISIBLE`: title/content verified, but course-specific code was not visible in extracted evidence; apply human review before relying on strict syllabus coverage.
- Any `NO_...` value: do not automatically use a PDF for that occurrence.
- A matching subject title alone does not prove the syllabus belongs to every course/semester sharing the same title.

No changes were made to the live catalog, Supabase, or application data in this cleanup.
