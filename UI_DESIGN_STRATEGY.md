# PrepMaster UI Design Strategy

> Goal: Give PrepMaster the clarity, typography, motion quality, and interaction discipline associated with excellent Apple interfaces, while preserving PrepMaster's own blue, violet, and gold identity.
>
> This is a web-app design strategy, not a request to copy Apple's native UI or branding. Apple HIG principles are translated into React, CSS, and accessible web patterns.

## 1. Design direction

**Quiet structure, confident typography, purposeful color, precise motion.**

PrepMaster should feel focused and dependable rather than decorative. The interface should make study tasks, exam decisions, student progress, and admin operations easy to understand. Every visual effect must support hierarchy, feedback, or orientation.

Use Apple's Human Interface Guidelines as a quality reference:
- [Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles) — purpose, agency, responsibility, familiarity, flexibility, simplicity, craft, and delight.
- [Typography](https://developer.apple.com/design/human-interface-guidelines/typography) — legibility, hierarchy, restrained typeface use.
- [Color](https://developer.apple.com/design/human-interface-guidelines/color) — consistent semantic color and accessible contrast.
- [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) — grouping, alignment, hierarchy, and responsive behavior.
- [Motion](https://developer.apple.com/design/human-interface-guidelines/motion) — purposeful, brief, optional motion.
- [Loading](https://developer.apple.com/design/human-interface-guidelines/loading) and [Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators) — keep people informed without making them wait unnecessarily.

For implementation reviews, use [dickwu/apple-design-skill](https://github.com/dickwu/apple-design-skill). Read its `SKILL.md` and the relevant HIG reference pages before reviewing a significant screen. Do not copy its files or Apple assets into PrepMaster by default; use it as a review method and design reference.

## 2. PrepMaster color language

The existing palette is part of the product identity. Keep it; assign each color a stable meaning.

| Role | Existing token / value | Use |
|---|---|---|
| Main background | `--bg-primary: #0f1115` | Main application canvas |
| Elevated surface | `--bg-secondary: #16181d` | Panels, navigation, overlays |
| Interactive surface | `--bg-tertiary: #1c1f26` | Inputs, secondary controls |
| Primary action | `--accent-primary: #3b82f6` | Main actions and active navigation |
| Secondary brand | `--violet: #8d7bff` | Selected states, supporting emphasis |
| Warm highlight | `--gold: #ffb454` | Focus, important milestones, small highlights |
| Main text | `--text-primary: #ffffff` | Headings and essential content |
| Supporting text | `--text-secondary: #a0a5b1` | Descriptions and metadata |
| Muted text | `--text-tertiary: #6b7280` | Low-priority labels only |
| Success / warning / danger | `--success`, `--warning`, `--danger` | Status feedback, never decoration |

Rules:
1. Blue is the primary action color. Violet supports selection and secondary brand expression. Gold is a scarce highlight, not a second primary action color.
2. A color must mean the same thing throughout the product. Do not use gold for an error in one view and a success state in another.
3. Do not place gradients on every card or button. Reserve the blue-violet gradient for a clear primary action or one signature moment.
4. Keep body text and controls comfortably contrasted against their surfaces. Never communicate status through color alone; include a label, icon, or shape.
5. Prefer semantic CSS variables over raw hex values in components. Add tokens to `src/index.css` before introducing another recurring color.
6. The product currently favors dark surfaces. Keep dark-mode contrast deliberate; if a light appearance is introduced later, define a complete light token set rather than mechanically inverting these values.

## 3. Typography system

Use typography to create hierarchy before adding borders, color, or decoration.

- Use the existing Inter family for now, with a system fallback: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Prefer Regular (400), Medium (500), Semibold (600), and Bold (700). Avoid thin weights for small text.
- Use size, weight, line-height, and letter-spacing as a consistent scale. Avoid making every label bold or every heading oversized.

Recommended web scale:

| Role | Desktop starting size | Weight | Guidance |
|---|---:|---:|---|
| Display / page hero | 36–44 px | 650–750 | Use for one main heading, not every panel |
| Page heading | 28–34 px | 650–700 | Clear page identity |
| Section heading | 20–24 px | 600–650 | Groups related content |
| Card / component heading | 16–18 px | 600 | Compact and scannable |
| Body | 15–16 px | 400–450 | Comfortable reading |
| Supporting text | 13–14 px | 400–500 | Keep contrast strong |
| Micro-label | 11–12 px | 600–700 | Use sparingly; never for essential instructions |

For mobile and zoomed layouts, let headings wrap and scale down naturally. Never solve overflow by clipping text. Essential instructions should not be relegated to micro-label sizes.

Use sentence case for most web labels and actions. Keep wording short, specific, and consistent. Prefer action labels such as “Save changes” and “Create exam” over vague labels such as “Continue” when the outcome can be named.

## 4. Layout, surfaces, and spacing

- Establish hierarchy with alignment, grouping, and whitespace before using extra containers.
- Keep one dominant task per view. Use progressive disclosure for less-frequent controls and advanced configuration.
- Use the existing radius family consistently: small controls, medium inputs, larger panels. Avoid introducing a new radius value for each component.
- Use borders and shadows to separate layers, not to outline every item.
- Keep translucency and blur for functional layers such as overlays or compact navigation. Do not put frosted glass behind every content block.
- Use responsive widths and content-driven breakpoints. Do not design only for one desktop screenshot.
- Preserve familiar placement and interaction patterns between student and admin areas. Their data and actions differ; their component language should remain coherent.

Suggested spacing rhythm (4 px base):
- 4–8 px: icon-to-label and tight internal relationships.
- 12–16 px: form fields and compact component groups.
- 20–24 px: card sections and related content groups.
- 28–40 px: major page sections.
- 48–64 px: page-level separation and hero spacing.

## 5. Motion and interaction

Motion should explain a change, not compete with the task.

| Motion | Starting range | Use |
|---|---:|---|
| Small hover / focus response | 120–180 ms | Buttons, links, small controls |
| State transition | 180–260 ms | Selection, expansion, status changes |
| Content entrance | 260–420 ms | One-time page or section appearance |
| Large layout transition | 300–450 ms | Only where it helps people track the change |

Implementation rules:
1. Use the shared easing token `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)` for gentle deceleration.
2. Animate opacity and transform where possible. Avoid animating layout-heavy properties on every frame.
3. Keep repeated interactions subtle. Do not make users wait for an animation to finish before continuing.
4. Respect `prefers-reduced-motion: reduce`. Remove decorative movement and shorten transitions; the same information must remain available without animation.
5. Use a single signature motion per screen. Do not combine several pulsing glows, floating cards, spinning icons, and moving gradients in one view.
6. Motion must never be the only indication that an operation succeeded, failed, or is in progress.

### Loading and progress

- Render the first useful state quickly. Do not add artificial delays to make the interface look animated.
- Use text that describes the actual work: “Restoring your session”, “Authorizing your account”, “Loading account context”, “Preparing your workspace”.
- Use determinate progress only when the completion percentage is real. For unknown network operations, use a restrained indeterminate indicator.
- For multi-step startup, highlight the current milestone and mark completed milestones clearly. If a stage completes too quickly, it is acceptable for users not to notice every intermediate stage.
- On failure, explain what could not be verified and provide a recovery action. Never show a student or admin workspace based on an inconclusive role check.

## 6. Accessibility baseline

- Ensure keyboard focus is visible and follows a logical order.
- Use semantic HTML, labels, button types, accessible names, and live regions for asynchronous status.
- Never remove focus outlines without a clear replacement.
- Aim for WCAG AA contrast: 4.5:1 for normal text and 3:1 for large or bold text.
- Do not convey selected, success, warning, or error states through color alone.
- Make interactive targets comfortable on touch screens; aim for at least 44 × 44 px where practical.
- Check layouts at narrow widths, high zoom, and larger text sizes.
- Test reduced motion and keyboard-only interaction in addition to mouse interaction.

## 7. Component design rules

**Buttons**
- One visually dominant primary action per local group.
- Secondary actions should be quieter, not another competing gradient.
- Keep loading, disabled, hover, focus, and success states explicit.
- Do not change button wording unpredictably between screens.

**Cards and panels**
- Use a card when it groups content or action meaningfully.
- Do not wrap every paragraph, statistic, and label in a card.
- Keep card padding, heading hierarchy, and action placement consistent.

**Forms**
- Use clear labels and concise help text.
- Keep validation close to the field and explain how to recover.
- Preserve entered values after recoverable errors.
- Show character limits and required states when they affect the task.

**Navigation**
- Clearly distinguish active location from hover and focus.
- Keep student and admin navigation predictable.
- Do not expose admin navigation until the account role has been verified.

**Dashboards**
- Lead with the user's next useful action and the most relevant information.
- Keep charts and statistics legible; avoid ornamental gradients and oversized figures without context.
- Explain empty states and data freshness.

## 8. Design and implementation workflow for future UI work

Before implementing a new screen or redesign:

1. **Understand the task.** Identify the user, the main job, the key action, the content needed, and the failure/empty/loading states.
2. **Inspect existing patterns.** Search the repository for an established component, token, or behavior before creating a new one.
3. **Read relevant guidance.** Use the Apple Design Skill's `SKILL.md`, then load the relevant official HIG pages. For a web app, translate native concepts into familiar web patterns; do not imitate a native iOS control literally.
4. **Write the visual hierarchy first.** Define the page title, primary action, content groups, and secondary information before styling.
5. **Use PrepMaster tokens.** Reuse the blue-violet-gold color roles, existing radii, shadows, and easing. Add a new token only when there is a recurring semantic need.
6. **Implement every state.** Design loading, success, empty, error, disabled, hover, focus, and narrow-screen behavior—not just the ideal screenshot.
7. **Review the craft.** Remove unnecessary decoration. Check typography, spacing, consistency, contrast, and motion. Ask: “Does every element earn its place?”
8. **Verify.** Run the relevant Vitest tests, production build, and lint checks. Inspect both the ordinary and reduced-motion states.

For substantial redesigns, document:
- Purpose and primary user task.
- Palette roles and typography hierarchy.
- Layout/grouping plan.
- One signature visual or motion detail.
- Accessibility and responsive behavior.
- Loading, empty, error, and success states.

## 9. Review checklist

- [ ] The page's purpose is obvious within a few seconds.
- [ ] One action has clear visual priority.
- [ ] Existing semantic color meanings are preserved.
- [ ] Typography carries the hierarchy; decoration is not doing all the work.
- [ ] Spacing and alignment make related content feel related.
- [ ] Motion is brief, meaningful, and reduced-motion aware.
- [ ] Loading and error states explain what is happening and what the person can do.
- [ ] Keyboard focus, labels, and contrast are accessible.
- [ ] The layout works on mobile, desktop, and zoomed views.
- [ ] New UI reuses existing components and design tokens where possible.

---

**Decision rule:** When visual polish conflicts with clarity, accessibility, performance, or trustworthy behavior, choose the latter. PrepMaster should feel refined because the details are considered—not because effects have been layered on top.
