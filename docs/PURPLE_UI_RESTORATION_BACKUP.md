# Purple UI restoration safety record

- Current protected snapshot: `360f5a38fcb78bb7b059e045f13f4bd85e5df8ff`
- Historical visual reference: `ca9fcfd0dae241f5a5d70ec391b34e99e9e33271`
- Backup branch: `backup/main-before-purple-ui-restore-2026-11-05`
- Restoration branch: `restore/purple-ui-with-current-logic-2026-11-05`
- Production branch: `main` (not modified by this restoration)

## What this restoration changes

Only the active visual stylesheet in place of the November 5 warm-white/gold global theme, plus page-scoped palette overrides in `PurpleRestoration.css`. `App.jsx` changes one CSS import. Current component markup and behavior are intentionally kept.

## Protected current functionality and artwork

The restoration branch starts at the full current-main commit. It does not revert or cherry-pick application logic. Current SVG illustrations and the latest homepage JSX are retained. This includes current route behavior, leaderboard URL persistence, admin course/syllabus flows, catalog activation/subject resolution, exam-generation algorithms, Test Room lifecycle, auth/deep-link handling, Supabase migrations, API handlers and tests.

## Recovery

To abandon the restoration, use the backup branch as the source of truth:
`backup/main-before-purple-ui-restore-2026-11-05`.

Do not reset production to the historical UI commit. The historical commit is used only as a visual reference.
