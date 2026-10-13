# Science & Pharmacy ESE audit

## Rule

- `isDepartmentalSubject = true` when the verified syllabus scheme shows ESE marks as 0 / no ESE assessment.
- `isDepartmentalSubject = false` when the verified syllabus scheme shows positive ESE marks.
- Records with missing, ambiguous, or incorrectly mapped source evidence are marked `UNRESOLVED` in these reports and are **not classified by this audit**.

The audit uses the extracted syllabus records under `Syllabus/syllabus_txt/Science_Pharmacy/`. It does not treat a missing PDF, a failed extraction, or a questionable course/title mapping as evidence that ESE is absent.

## Audit status by program

| Program | Database subjects | Source occurrences in report | Audited | ESE absent (true) | ESE present (false) | Unresolved |
|---|---:|---:|---:|---:|---:|---:|
| B.Sc in Chemistry | 35 | 35 | 7 | 3 | 4 | 28 |
| B.Sc in Microbiology | 32 | 32 | 5 | 3 | 2 | 27 |
| B.Sc in Agricultural Honors | 70 | 70 | 4 | 1 | 3 | 66 |
| M.Sc in Chemistry | 22 | 22 | 4 | 0 | 4 | 18 |
| M.Sc in MicorBiology | 18 | 18 | 2 | 0 | 2 | 16 |
| M.Sc in PGDMLT | 9 | 9 | 0 | 0 | 0 | 9 |
| B.Pharm | 60 | 60 | 28 | 0 | 28 | 32 |
| M.Pharm Pharmaceutics | 20 | 20 | 4 | 0 | 4 | 16 |
| M.Pharm Pharmaceutical Quality Assurence | 21 | 21 | 9 | 1 | 8 | 12 |
| M.Pharm Regulatory Affairs | 17 | 19 | 7 | 1 | 6 | 12 |
| **Total** | **304** | **306** | **70** | **9** | **61** | **236** |

The source occurrence count is larger than the database count for M.Pharm Regulatory Affairs because the extracted semester inventory contains 19 rows while Supabase has 17 subject rows; two records therefore need catalog reconciliation.

## Reports

- [B.Sc in Chemistry](bsc_in_chemistry_ese_audit.csv)
- [B.Sc in Microbiology](bsc_in_microbiology_ese_audit.csv)
- [B.Sc in Agricultural Honors](bsc_in_agricultural_honors_ese_audit.csv)
- [M.Sc in Chemistry](msc_in_chemistry_ese_audit.csv)
- [M.Sc in Microbiology](msc_in_microbiology_ese_audit.csv)
- [M.Sc in PGDMLT](msc_in_pgdmlt_ese_audit.csv)
- [B.Pharm](bpharm_ese_audit.csv)
- [M.Pharm Pharmaceutics](mpharm_pharmaceutics_ese_audit.csv)
- [M.Pharm Pharmaceutical Quality Assurance](mpharm_pharmaceutical_quality_assurance_ese_audit.csv)
- [M.Pharm Regulatory Affairs](mpharm_regulatory_affairs_ese_audit.csv)

## Important limitation

The audit has confirmed ESE decisions for 70 source rows. The remaining 236 source rows are unresolved because their PDF mapping, extraction, or scheme table is not sufficiently reliable. The `Subjects.isDepartmentalSubject` column is currently non-nullable with a default of `false`, so unresolved database rows can still display `false` even though this audit did **not** verify that they have ESE. Treat only rows marked `AUDITED` in the CSVs as confirmed by this batch. The unresolved rows need source-PDF recovery and mapping review before further database changes.
