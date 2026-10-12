# First-batch B.Tech syllabus collector

This source package is retained for repeatable collection and audit. The 269 PDFs recorded in its original run have been merged into the parent collection's shared `_PDF_Library`. Browse the canonical result through `../../Programs/` and `../../_Catalogs/program_course_map.csv`.

## Run

1. From this folder on Windows, run `RUN_BATCH_1.bat`.
2. The tool writes temporary results under `output/` and records original links and SHA-256 values in `output/reports/`.
3. Review the manifest and missing-PDF report. Do **not** commit the generated `output/B.Tech programs` as a second syllabus tree. The shared library and program indexes are canonical.

The original collector only assigns semesters when explicit in page markup; otherwise its PDFs remain semester-unknown. Do not infer a semester from course-code digits.
