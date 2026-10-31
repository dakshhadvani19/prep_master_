# Agent instructions for PrepMaster

## UI and visual-design work

Before creating, redesigning, reviewing, or polishing any user interface, read:

1. `.agents/skills/prepmaster-ui/SKILL.md` — this is the product-specific design system and takes precedence for PrepMaster branding, colors, typography, components, and motion.
2. `.agents/skills/apple-design/SKILL.md` — the upstream Apple Design Skill, when the submodule is initialized. Follow its instruction to open only the relevant Human Interface Guidelines references for the screen being reviewed.

On a fresh clone, initialize the reference skill with:

```bash
git submodule update --init --recursive
```

Do not replace PrepMaster's palette with Apple's system colors, imitate Apple UI literally, or apply Liquid Glass as a default visual style. Translate platform-agnostic principles (clarity, hierarchy, accessibility, familiar controls, intentional motion, and craft) into this web application's existing React/CSS conventions.

Use the PrepMaster skill for implementation decisions. Use the upstream skill and its linked references as a review lens, not as permission to change the product's identity.

## General repository workflow

- Read `docs/optimized_task_completion_workflow.md` before substantial implementation work.
- Inspect the current implementation before editing. Preserve established behavior, routes, auth rules, exam logic, API contracts, and database schemas unless the request explicitly requires a change.
- Prefer focused, reviewable changes and existing dependencies. The UI stack already includes React, CSS, Framer Motion, and Lucide React under `global-exam-prep/`.
- Run the relevant tests and build for code changes. Do not claim checks passed unless they were run.
