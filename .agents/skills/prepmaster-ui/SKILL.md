---
name: prepmaster-ui
description: >
  PrepMaster's product-specific UI/UX and visual-design skill. Use for all design,
  redesign, component, typography, responsive layout, icon/logo, animation, loading,
  empty-state, dashboard, form, and accessibility work in the PrepMaster web app.
---

# PrepMaster UI Design Skill

## Purpose and design point of view

Design PrepMaster as a polished, dependable learning and examination product. Its visual language should feel **classical, composed, precise, and quietly distinctive**: familiar interface patterns first, strong typography and spacing second, and a few memorable brand details third.

The product must feel trustworthy during serious study and examination tasks. Avoid novelty that competes with the user's work. Distinctiveness should come from disciplined use of the existing amber focus-ring motif, carefully composed information hierarchy, restrained violet/gold accents, and purposeful micro-interactions — not from replacing familiar controls with experimental patterns.

This skill is the product-specific source of truth. Apple's Human Interface Guidelines are a secondary quality benchmark for clarity, accessibility, feedback, and craft. They do not define PrepMaster's brand palette or require an Apple-looking web interface.

## Design priorities

Resolve trade-offs in this order:

1. Preserve functionality, user expectations, and existing product behavior.
2. Preserve the PrepMaster visual identity and established design tokens.
3. Make information architecture, hierarchy, and interaction patterns obvious.
4. Meet accessibility, responsiveness, and performance requirements.
5. Add subtle polish and one coherent creative detail where it strengthens the experience.

Do not sacrifice task completion or readability for decoration, animation, novelty, or brand display.

## Product identity

- Product: PrepMaster — a web application for exam preparation, learning, student progress, and administration.
- Primary audiences: students and administrators. Their screens may have different information density and workflows, but must share one design language.
- Mood: focused, credible, encouraging, modern, and mature.
- Visual foundation: dark-first, near-black canvas; layered charcoal surfaces; cool blue interaction accents; warm amber/gold for achievement and brand emphasis; restrained violet for secondary accents.
- Personality: traditional product-design fundamentals with small, intentional moments of creativity.
- The existing amber focus/progress ring is a recognizable motif. Preserve and reuse it where relevant; do not scatter it across every component.

## PrepMaster color system

The current global token source is `global-exam-prep/src/index.css`. Read it before changing color usage. The values below document the established palette; they are not a request to rewrite the CSS.

| Role | Current token / value | Intended use |
|---|---|---|
| Main canvas | `--bg-primary: #0f1115` | App background and deepest page layer |
| Main surface | `--bg-secondary: #16181d` | Cards, panels, navigation surfaces |
| Raised surface | `--bg-tertiary: #1c1f26` | Inputs, nested panels, selected neutral surfaces |
| Primary text | `--text-primary: #ffffff` | Headings and essential content |
| Secondary text | `--text-secondary: #a0a5b1` | Supporting content and descriptions |
| Tertiary text | `--text-tertiary: #6b7280` | Metadata only when contrast remains adequate |
| Primary action blue | `--accent-primary: #3b82f6` | Primary interactive actions, links, focus-adjacent emphasis |
| Hover blue | `--accent-hover: #2563eb` | Hover/active treatment for blue actions |
| Warm gold | `--gold: #ffb454` | Achievements, progress milestones, premium emphasis, selected brand details |
| Bright gold | `--gold-bright: #ffd08a` | Small high-emphasis gold detail; use sparingly |
| Violet | `--violet: #8d7bff` | Secondary accent, analytics/insight visuals, restrained illustration |
| Success | `--success: #10b981` | Successful state, always paired with text/icon |
| Warning | `--warning: #f59e0b` | Warning state, always paired with text/icon |
| Danger | `--danger: #ef4444` | Destructive/error state, always paired with text/icon |
| Borders | `--border-color`, `--glass-border` | Quiet separation and component boundaries |

Additional established values include `--accent-gradient: linear-gradient(135deg, #3b82f6, #8b5cf6)`, translucent gold/violet fills, and subtle dark shadows. Treat gradients as an accent, not as the default background for every card, button, or page.

### Color rules

- Maintain the existing dark-first product appearance unless a light theme is explicitly requested.
- Keep purple/violet and gold balanced. Neither should flood large surfaces. Gold is a meaningful highlight, not the default button color; violet is a supporting accent, not a full-page wash.
- Preserve blue as the established primary-action color in current global tokens. Do not silently remap it while styling an unrelated screen.
- Assign each color a stable semantic meaning. Do not use the same accent indiscriminately for primary actions, passive decoration, success, and selection.
- Use semantic success/warning/danger colors consistently and include labels, icons, or shapes so color is never the only signal.
- Prefer surface contrast, borders, spacing, and type hierarchy over adding more accent colors.
- Check actual text/background contrast. Target WCAG AA: at least 4.5:1 for normal text and 3:1 for large text and meaningful UI boundaries.
- Do not invent a second palette inside an individual page. Existing page-scoped tokens may be retained when they serve a documented, intentional local role; inspect before normalizing them.
- Do not apply blur, glass, glow, or gradients to every surface. Glass is an occasional material treatment, never the structural foundation of the interface.

## Typography

### Existing typefaces

- **Inter** is the current global interface/body font.
- **Space Grotesk** is already used as a display face in the authentication experience. Use it selectively for prominent headings or a short branded display moment only when it is already loaded or can be added consistently.
- **JetBrains Mono** is used for technical/precision content such as OTP digits and may be used sparingly for codes, identifiers, or tabular technical values.
- Do not introduce a new typeface for a single card or isolated component. Avoid mixing more than two families in a normal screen.

### Hierarchy and usage

Use typography to establish a clear, repeatable reading order:

| Role | Typical range | Treatment |
|---|---:|---|
| Hero/display heading | 36–48 px | Strong weight, compact leading, selective display type |
| Page title | 28–36 px | Semibold/bold, concise |
| Section heading | 20–24 px | Semibold |
| Card/subsection heading | 16–18 px | Semibold |
| Body copy | 14–16 px | Regular, comfortable line height |
| Supporting text | 13–14 px | Regular/medium with sufficient contrast |
| Metadata/eyebrow | 11–12 px | Medium/semibold; use tracking sparingly |
| Numeric/code value | Context-specific | Tabular numerals or monospace where it improves scanning |

These are web design ranges, not fixed sizes that override existing responsive components.

- Prefer readable Regular, Medium, Semibold, and Bold weights. Avoid thin/light text for essential content.
- Use size, weight, and spacing to establish hierarchy; do not make every label bold or uppercase.
- Use uppercase, letter-spaced eyebrows only for short category labels, not paragraphs or important instructions.
- Keep body text comfortably readable, with roughly 1.45–1.65 line height for normal content.
- Use tabular numerals for scores, rankings, timers, percentages, and aligned metrics.
- Use monospace only when the data benefits from its precision; do not set all dashboard numbers or body copy in monospace.
- Keep text left-aligned by default. Center alignment is for deliberately short hero content, empty states, and compact status moments.
- Avoid truncating important exam instructions, button labels, or error descriptions. Allow wrapping and responsive reflow.

## Layout and composition

Use established editorial and application layout techniques:

- Start with clear page hierarchy: breadcrumb/context if needed → page title → short explanation or summary → primary action → content.
- Align related content to shared edges. Use consistent columns, deliberate indentation, and whitespace to distinguish groups.
- Use an 8 px spacing rhythm as the default design vocabulary (4, 8, 12, 16, 24, 32, 40, 48). Match existing local patterns rather than forcing every measurement onto the grid.
- Keep reading widths comfortable. Long-form explanatory text should not stretch across very wide dashboard layouts.
- Use responsive grids that collapse cleanly. Do not rely on fixed widths that create horizontal overflow on smaller screens.
- Respect current project conventions: global content containers are around 1200–1400 px; student dashboard content is narrower; admin content has its own wider max width. Inspect each page before changing its width.
- Use spacing, alignment, restrained borders, and subtle surface differences to separate content. Avoid nesting cards inside cards without a meaningful grouping reason.
- Preserve familiar navigation, breadcrumbs, search, tabs, pagination, tables, and form patterns. Do not invent navigation metaphors when a standard one works.
- Build a clear visual distinction between content and controls. Interactive elements must look interactive; passive labels should not look like buttons.
- Treat mobile as a first-class layout: stack columns, preserve tap targets, keep important actions reachable, and prevent dense tables or forms from collapsing into unusable layouts.
- Prefer progressive disclosure for advanced filters, secondary actions, and low-frequency settings. Do not expose every possible option at once.

## Component standards

### Buttons and actions

- Provide a clear action hierarchy: one primary action per major region, secondary actions visually quieter, destructive actions unmistakably separate.
- Use filled blue for the established primary action; use neutral/outlined treatments for secondary actions. Reserve gold for a meaningful milestone, special action, or established brand moment rather than coloring every CTA gold.
- Labels must state the outcome with a clear verb. Prefer `Save changes`, `Start exam`, `View results` over vague labels such as `Continue` when context is insufficient.
- Keep button heights and padding consistent within a view. Aim for a minimum interactive target of 44 × 44 CSS px where practical.
- Provide visible hover, pressed, focus-visible, disabled, and loading states. A pointer hover is never the only interaction cue.
- Use a subtle pressed response (for example, a very small scale/brightness change); avoid oversized bounce or elastic effects.
- A button that starts an async action should prevent accidental duplicate submission and communicate progress without shifting the surrounding layout.

### Cards and panels

- Use a clear surface hierarchy: page canvas → primary panel → optional nested inset.
- Keep borders low-contrast and shadows restrained. A card should not need a glow to appear elevated.
- Use consistent corner radii within a component family. Prefer the existing 12–16 px family for ordinary panels; larger hero surfaces may use a larger radius when justified.
- Hover lift is optional and should be small (typically 1–3 px) and only applied to cards that are genuinely interactive.
- Do not make static information cards appear clickable. For interactive cards, provide hover, focus, and keyboard activation states.

### Forms and inputs

- Place persistent labels above fields. Use placeholders only as examples, not as replacements for labels.
- Keep helper text and validation feedback adjacent to the relevant field.
- Show errors in plain language with a practical recovery path. Do not rely on red borders alone.
- Distinguish required, optional, disabled, invalid, and read-only states.
- Preserve typed values when validation fails. Do not clear a form because one field is invalid.
- Ensure focus order is logical and every control can be used with a keyboard.

### Navigation, tabs, and menus

- Use conventional placement and familiar visual patterns. Current navigation, routes, and role-specific destinations are product behavior and must not be changed during a visual-only task.
- Show the active destination clearly using a stable indicator plus label/ARIA state where appropriate.
- Keep navigation labels concise and understandable without decorative icons.
- Use menus for secondary or infrequent actions; do not hide the only route to a core task in an overflow menu.
- Provide a usable mobile navigation pattern and close transient menus on route changes or escape where appropriate.

### Tables, scores, and dashboards

- Prioritize scanning: clear column labels, aligned values, readable row spacing, and predictable sorting/filtering.
- Right-align numeric columns; use tabular numerals for scores, time, percentages, and ranks.
- Distinguish status with both text and a visual cue.
- Avoid excessive gridlines, badges, color fills, and decoration. Use emphasis only for the most important comparisons.
- Provide loading, empty, error, and stale-data states. Do not replace a real zero with a blank or ambiguous dash.

### Dialogs, alerts, and destructive actions

- Use dialogs only when the decision genuinely requires interruption or confirmation.
- Make the title explain the decision and the actions explain their outcome.
- Keep the safe/cancel action visible and never style a destructive action as the primary positive action.
- Preserve user input and offer a recovery path whenever possible.
- Prefer inline feedback for non-critical status updates instead of repeatedly interrupting users with alerts.

### Loading, empty, and error states

- Render useful structure as early as possible. Use skeletons/placeholders when the final layout is predictable; use a clear progress indicator for genuine work.
- Use determinate progress only when progress can be measured. Never invent percentage completion.
- Give loading stages meaningful labels only when they correspond to real work (for example, loading content, checking access, preparing the workspace). Do not present fake technical stages.
- Empty states should explain why the space is empty and offer one obvious next step when one exists.
- Errors should explain what failed in user language, preserve recoverable state, and make retry or correction clear.
- Keep transient feedback close to the control or content it describes.

## Motion and animation

The current shared easing token is `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`. The global CSS already includes reduced-motion handling. Framer Motion is already installed; use it when it materially simplifies a multi-element or route transition. Do not add another animation dependency.

### Motion language

- Motion should explain a state change, relationship, hierarchy, or successful action. Never animate only because a screen feels empty.
- Prefer short, precise transitions:
  - micro feedback: roughly 120–180 ms;
  - control/state transitions: roughly 160–240 ms;
  - page/section transitions: roughly 180–280 ms.
- Use opacity and small spatial movement (about 4–8 px) for enter/exit transitions. Use scale sparingly and keep it subtle.
- Keep interactive feedback immediate. Do not delay clicks, navigation, keyboard focus, or exam controls until an animation finishes.
- Use one coherent easing curve across related components. Match the existing ease-out token unless there is a specific reason not to.
- Loading indicators may rotate when they represent ongoing work; decorative infinite loops, drifting gradients, and always-moving backgrounds should be avoided.
- Use progress-ring motion as a brand motif only when it communicates progress, countdown, focus, or loading. Do not use a spinning ring as generic decoration.
- Avoid parallax, large spring overshoots, excessive staggered entrances, dramatic zooms, cursor-following effects, and long cinematic page reveals.
- Respect `prefers-reduced-motion: reduce`. Provide a meaningful static state and ensure motion is never the only way to understand status.
- Never animate essential exam content in a way that distracts from reading or timing.

## Logo, brand mark, and iconography

- Preserve the existing PrepMaster logo/mark and its proportions unless the task explicitly asks to redesign it.
- The amber focus/progress ring is the current distinctive brand motif. Use it consistently and sparingly; do not invent unrelated marks for individual pages.
- Do not add the PrepMaster logo to every card or repeat brand marks where product context is already clear.
- Keep the logo optically balanced and legible at small sizes. Avoid thin details, dense text, or effects that disappear at favicon scale.
- The installed icon library is `lucide-react`. Prefer it over emoji or ad-hoc Unicode glyphs for interface controls.
- Keep icon family, stroke weight, and sizing consistent. Use the icon's familiar metaphor; pair ambiguous icons with a visible label or tooltip.
- Typical icon sizes: 16 px for compact metadata, 18–20 px for normal controls, 22–24 px for prominent navigation/action icons.
- Decorative icons should be hidden from assistive technology. Icon-only buttons need an accessible name and adequate target size.
- Do not copy SF Symbols, Apple hardware, Apple marks, or another product's logo. Use the HIG's general icon-design lessons (simplicity, consistency, recognizability, optical alignment) in original PrepMaster artwork.

## Responsive and accessible behavior

- Preserve the existing responsive breakpoints unless a demonstrated layout issue requires a scoped addition. Current global styles include 768 px and 480 px breakpoints.
- Test narrow phone widths, tablet widths, and wide desktop layouts. Avoid horizontal page overflow and clipped controls.
- Support zoom/text enlargement and content wrapping. Do not set fixed heights on text-heavy cards or controls unless overflow is explicitly handled.
- Maintain visible keyboard focus. Do not remove outlines without replacing them with a stronger accessible focus treatment.
- Use semantic HTML and correct heading order. Keep interactive elements keyboard-operable and expose state with accessible attributes.
- Aim for WCAG AA contrast. Verify muted text, disabled states, icons, borders, and colored labels — not only main body text.
- Do not communicate success, failure, ranking, or selection by color alone.
- Respect reduced motion and make animations non-essential.
- Ensure controls have labels, inputs have associated labels, and icon-only actions have accessible names.
- For tables and lists, preserve a logical reading order for screen readers.

## Creative direction: classical foundations, small signature details

Use traditional product-design craft as the foundation:

- Consistent grid, alignment, spacing, and type scale.
- Familiar navigation and component behavior.
- Strong contrast and restrained color.
- Clear grouping and predictable control placement.
- Content-first layout and useful whitespace.

Add creativity through only a few purposeful details:

- A carefully drawn focus/progress ring or progress arc.
- A warm gold edge, underline, or small highlight at an achievement moment.
- A subtle violet/blue data visualization accent.
- A well-composed display heading or editorial numeric treatment.
- A short, meaningful transition tied to completion, selection, or navigation.

Do not combine every effect on one screen. Choose one signature detail and let the rest of the layout remain calm.

## Implementation workflow for UI tasks

1. Inspect the existing page, its parent layout, nearby components, CSS, route behavior, and tokens before editing.
2. Identify whether the requested work is visual-only or changes interaction behavior. Do not alter data flow or behavior during a visual-only task.
3. Reuse shared tokens and components. Keep page-specific CSS scoped; avoid global overrides for a single screen.
4. Prefer existing React, CSS, Framer Motion, and Lucide React. Add dependencies only with a concrete need.
5. Preserve all existing routes, role checks, auth/session behavior, exam rules, API contracts, database schema, and user-entered state unless explicitly in scope.
6. Implement the smallest coherent change. Avoid unrelated cleanup or broad restyling.
7. Verify responsive behavior, keyboard focus, reduced motion, and relevant loading/empty/error states.
8. Run focused tests and `npm run build` from `global-exam-prep/` when code changes warrant it. Run lint when relevant, and report pre-existing failures separately.
9. Review the final diff for unintended changes.

## Design review response format

When asked to review a screen, structure findings as:

- **Finding:** the concrete issue and where it appears.
- **Why it matters:** the usability, accessibility, consistency, or craft consequence.
- **Recommended treatment:** a specific implementation-level correction using PrepMaster's existing palette and stack.
- **Priority:** blocker, high, medium, or polish.

When referencing Apple HIG guidance, first read the corresponding file from `.agents/skills/apple-design/references/hig/` and cite its filename and heading. If the upstream submodule has not been initialized, say so and do not invent quotations or section names.

## Reference library

The upstream Apple Design Skill is tracked as a Git submodule at `.agents/skills/apple-design`. Initialize it with `git submodule update --init --recursive`.

For any review, start with the upstream skill's own `SKILL.md` and then load only the relevant references. Its normal baseline is accessibility, layout, typography, color, and cross-platform translation; add component-specific pages for the UI under review (for example buttons, sidebars, loading, feedback, motion, icons, or app icons).

Useful source: https://github.com/dickwu/apple-design-skill
