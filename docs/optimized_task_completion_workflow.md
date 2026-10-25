# Optimized Task Completion Workflow

## Purpose

Use this workflow as the default for software tasks in PrepMaster and similar repository-backed work. The goal is to deliver the smallest correct change quickly, with evidence that it works, while avoiding repeated planning, unnecessary agent coordination, and unsupported completion claims.

## Core principle

**Move directly from understanding to implementation, then verify. Do not confuse speed with skipping verification.**

Prefer direct repository work when repository tools can read and modify the required files reliably. Use Arena, Antigravity, another coding agent, or a local coding environment when it provides a concrete advantage (for example, executing the app locally, using a browser, debugging a runtime-only issue, or exploring a broad set of interdependent files).

This is the default, not an inflexible rule. Choose the method that best fits the task and available access.

## Workflow

### 1. Define the deliverable and constraints

- Translate the request into a concrete outcome and a short acceptance checklist.
- Reuse constraints already established in the conversation and current repository documentation; do not ask the user to repeat information already available.
- Identify what must remain unchanged, such as public interfaces, exam blueprints, schemas, authentication rules, or existing behavior.
- Ask a clarification only when an essential decision cannot be safely inferred. Otherwise, make a sensible, reversible assumption and state it when material.

### 2. Inspect the actual source of truth

- Read the smallest relevant set of files first, then follow imports/callers and tests as needed.
- Treat the current target branch's code as the implementation source of truth; do not rely on stale conversation snippets, archived copies, or assumptions about the local checkout.
- Check the repository's architecture, package scripts, naming conventions, and applicable docs.
- Batch independent file reads where possible.
- Do not spend time re-discovering architecture that has already been verified and remains current.

### 3. Choose the shortest reliable implementation path

- Prefer direct, targeted edits to the existing code when repository read/write tools support them.
- Reuse current libraries and services before adding a dependency, service, runtime, or new abstraction.
- Keep changes focused. Do not rewrite entire large files when a small, verified edit is sufficient.
- For files with CRLF/LF differences, prefer a replacement method that handles either newline convention and verify the exact resulting diff. Do not keep retrying the same failing edit method indefinitely.
- Preserve compatibility for other callers when modifying a shared utility. Add options or a dedicated helper if new behavior should apply only to one feature.
- Avoid introducing an external coding agent only to perform simple, focused edits that can be safely made directly.
- Use a coding agent when local execution, visual debugging, a large multi-file refactor, or an environment unavailable to direct repository tools materially benefits from it.

### 4. Implement in small, reviewable units

- Make a coherent change to a file or tightly related set of files.
- Re-read modified files or relevant sections after edits.
- Add or update tests alongside the implementation, not as a vague future step.
- Keep user-visible progress updates short and meaningful; do not narrate repeated plans or low-value tool activity.
- If a tool or access path fails, try one materially different recovery method. If access still fails, report the exact blocker and switch methods when practical.

### 5. Verify behavior, not just file presence

Run the checks appropriate for the project, preferably in this order:

1. Focused tests for the changed behavior.
2. Full test suite.
3. Lint/type checks.
4. Production build.
5. A smoke test of the real user flow when possible (including external-service integration only when safe and configured).

For PrepMaster's `global-exam-prep/`, available scripts include:

- `npm run test`
- `npm run lint`
- `npm run build`

Review the diff for accidental changes, missing imports, broken call sites, test assumptions, and regressions in unrelated paths. Use deterministic mocks for tests that should not depend on Groq, network access, credentials, or real uploaded documents.

If local execution is unavailable, use CI/deployment checks or available repository signals where possible. Clearly distinguish:
- code committed,
- automated checks passed,
- deployment succeeded,
- real user flow smoke-tested.

These are separate claims. A successful deployment alone does not prove the feature's runtime behavior.

### 6. Commit and deploy responsibly

- Follow the repository's documented Git policy. PrepMaster defaults to direct work on `main` unless the user explicitly requests another flow.
- Prefer coherent, reviewable commits for related changes; avoid a long series of unnecessary one-line commits.
- Verify the commit SHA and inspect the committed files/diff.
- Check deployment status after pushing when deployment status is available.
- Do not claim a test, build, smoke test, or deployment succeeded unless its result was actually observed.

### 7. Report completion precisely

Give the user a concise summary containing:

1. What changed and where.
2. Which important behavior/constraints were preserved.
3. Tests, lint, build, and smoke-test results, including anything not run.
4. Commit/deployment status when applicable.
5. Any real limitations or remaining risks.

Do not overstate confidence. Use wording such as “implemented but not runtime-verified” when that is the evidence-supported status.

## Efficiency rules

- Start implementation as soon as the current code and acceptance criteria are sufficiently clear.
- Do not repeatedly restate the plan or ask the user to approve ordinary implementation details.
- Avoid unnecessary web searches, extra dependencies, duplicate analysis, and agent handoffs that do not reduce uncertainty.
- Prefer bulk reads/writes only when independent and safe; never parallelize conflicting updates to the same file.
- Never use a large rewrite merely to work around a small edit problem.
- Spend verification effort in proportion to the risk of the change.
- Keep the user informed when work is long-running, but share durable findings rather than filler progress reports.

## Definition of done

A task is done only when the requested change is implemented and the relevant verification status is known. “Committed,” “deployed,” and “tested” must not be treated as interchangeable.

If a verification step cannot be performed, the implementation may still be delivered, but the limitation must be explicit.
