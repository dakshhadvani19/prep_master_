# Marwadi University B.Tech Syllabus Collection

This is the **single consolidated B.Tech syllabus location** for the first batch, the middle official-page collector, and the last verified-recovery batch.

## Where to look

- [Program indexes](Programs/) — one folder per program. Open its `README.md` to browse courses and open linked syllabus PDFs.
- [Unique PDF library](_PDF_Library/) — each distinct PDF content is stored only once.
- [Program-to-PDF map](_Catalogs/program_course_map.csv) — all original program/semester-to-PDF relationships, with source paths and batch labels.
- [Unique PDF index](_Catalogs/pdf_library_index.csv) — one row per stored PDF with SHA-256, size, and program references.
- [Program catalog](_Catalogs/program_catalog.csv) — the 20 program entries and source-page status.
- [Tools and reports](_Tools/) — collection scripts, configurations, tests, and original run reports. Future collector outputs are temporary and ignored by Git.

## Deduplication result

- Original PDF occurrences from the first and last batches: **313**
- Distinct PDF contents retained: **157**
- PDF payload before deduplication: **80.20 MiB**
- Unique PDF payload retained: **40.73 MiB**
- Duplicate payload avoided in this checkout: **39.48 MiB**

The program map preserves every association even when several programs use identical PDF bytes. Each unique PDF is stored once in `_PDF_Library`.

## Semester handling

The first batch did not reliably detect semesters, so those PDFs are labelled `Unknown`. No semester is inferred from course-code digits. Explicit semester folders in the last recovery batch were retained and normalized to `Semester_01`, etc.

## Program coverage

The middle collector defined **20 program entries**. PDFs were present in **9** program indexes across the first and last PDF batches. A program with no linked PDFs means only that these batches did not contain a collected file for it; it is not proof that a syllabus does not exist.

## Provenance

- Original reports, manifests, scripts, configurations, and tests are preserved under `_Tools`.
- The map records all **313 source PDF occurrences** with SHA-256 values and original paths.
- Use official Marwadi PDFs first. GTU fallback materials should be accepted only after specific review; a similar title alone does not establish equivalence.
- Earlier Git commits still contain the pre-consolidation layout. This change reduces the current checkout; it does not rewrite historical Git objects.
