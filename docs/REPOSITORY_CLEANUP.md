# Repository cleanup — 2026-11-22

## Runtime files retained

The deployed website remains in the global-exam-prep directory. The cleanup retained the React/Vite source, Vercel API handlers, route and design assets, runtime syllabus data in public/syllabus, package manifests and lockfile, Vercel configuration, tests, and the Supabase migration history.

The root deployment configuration, .gitignore, GitHub workflows, docs/, and SRS/ are also retained.

## Reference material moved under docs

- global-exam-prep/Algorithm/ → docs/Algorithm/
- global-exam-prep/AUTH.md → docs/AUTH.md
- global-exam-prep/temp_removed_subjects/ → docs/archives/temp_removed_subjects/
- global-exam-prep/tools/diploma-syllabus-recovery/ → docs/archives/diploma-syllabus-recovery/
- The root QA_REPORT.md → docs/QA_REPORT.md

The moved archive CSVs remain available to the subject-bridge regression test; the test now reads them from the documentation archive.

## Removed repository-only material

- UI/agent instruction scaffolding: AGENTS.md, DESIGN.md, ui-instructions.md, .agents/, and .gitmodules.
- Root archival copies: Questions/, Syllabus/, all_departments_syllabus/, removed_verification/, the root syllabus ZIP, and its generated manifest.
- Unused parser outputs and offline source files under global-exam-prep/: duplicate diploma PDFs, parser-only JSON exports, parser scripts, and the README-only syllabus-pdfs/ folder.

These items were not imported or served by the live React/Vite application. The production syllabus payloads remain in global-exam-prep/public/syllabus/.

## Supabase SQL files intentionally retained

global-exam-prep/supabase/migrations/ was not deleted. The deployed application does not execute migration files during normal page requests, but these files preserve the schema, RPC, RLS, and trigger history of the live database. Several SQL regression tests read them directly. Deleting them would not immediately erase the live Supabase schema, but would damage database recovery/reproducibility and break those tests.

## Scope

This cleanup changes repository organization and removes unused source archives only. It does not modify Supabase data, database objects, environment variables, production API behavior, or runtime syllabus assets.
