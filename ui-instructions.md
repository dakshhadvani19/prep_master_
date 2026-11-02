# Mandatory Frontend Design & UI Engineering Standards

These standards are mandatory whenever a task involves frontend development, UI design, redesigning screens, dashboards, components, landing pages, or improving visual quality.

## PrepMaster-specific integration and precedence

This repository already has a product-specific UI skill. For every PrepMaster UI task, also read:

- `AGENTS.md`
- `.agents/skills/prepmaster-ui/SKILL.md`
- The relevant Apple Design Skill files under `.agents/skills/apple-design/`, when the submodule is initialized.

This document defines the mandatory two-reference workflow below. The existing PrepMaster UI skill complements it and provides the product-specific source of truth for PrepMaster's identity, palette, typography, component conventions, and established interaction patterns.

When guidance appears to conflict, apply this order:

1. Preserve functionality, user expectations, accessibility, and the existing product identity.
2. Preserve the existing PrepMaster design tokens, brand colors, and established project conventions.
3. Use Avoid AI Design to identify generic patterns and establish an intentional, product-specific direction.
4. Use Apple Design Skill and relevant Human Interface Guidelines for transferable principles of clarity, hierarchy, interaction, accessibility, and craftsmanship.
5. Adapt all external guidance to the actual product, audience, framework, and existing implementation. Do not copy another product's visual identity.

If an external reference, repository, scanner, or HIG document cannot be accessed, state that limitation. Do not claim to have consulted or run something that was unavailable.

---

Whenever a task involves frontend development, UI design, redesigning screens, dashboards, components, landing pages, or improving visual quality, use BOTH repositories below as complementary design references.

## Repository 1: Avoid AI Design

[https://github.com/funboy322/avoid-ai-design](https://github.com/funboy322/avoid-ai-design)

## Repository 2: Apple Design Skill

[https://github.com/dickwu/apple-design-skill](https://github.com/dickwu/apple-design-skill)

### Mandatory execution order

**PHASE 1 — Deep Design Audit (avoid-ai-design)**

Before designing or modifying the frontend:

1. Consult the latest `SKILL.md`.
2. Deeply study the relevant sections of `references/ai-tells-catalog.md` and `references/aesthetic-directions.md`.
3. Inspect the existing application, its components, design tokens, branding, and page structure.
4. Identify first-order and second-order generic AI design patterns.
5. Understand the product, its audience, and its distinctive characteristics.
6. Establish an intentional design direction rooted in the product rather than copying fashionable design templates.

Do not simply replace purple gradients with cream/terracotta, black/lime, or another generic AI aesthetic.

**PHASE 2 — Actual Design and Improvement (apple-design-skill)**

After completing Phase 1, use this repository for the actual design process.

1. Read its latest `SKILL.md`.
2. Consult the relevant Apple Human Interface Guidelines before making design decisions.
3. Apply its eight design principles, visual craftsmanship, layout, typography, interaction, accessibility, and responsive design guidance.
4. Use its design improvement mode to establish a coherent token system and distinctive visual identity.
5. Translate its guidance into the project's actual technology and framework.
6. Preserve familiar platform conventions where applicable.
7. Use Apple-specific conventions for Apple-platform applications. For ordinary web applications, apply the transferable design and usability principles rather than blindly copying native Apple controls.

Prioritize accessibility, usability, consistency, and craftsmanship before decorative polish.

### CRITICAL RULE: PRESERVE EXISTING BRAND COLORS

Before making any design modifications, inspect the existing color system.

This includes:

- Existing HEX/RGB color values.
- Primary and secondary brand colors.
- Background and surface colors.
- Text and border colors.
- CSS variables, Tailwind configuration, theme providers, and design tokens.

**Existing project colors take priority over newly proposed colors.**

Do not replace, discard, or arbitrarily modify the existing brand palette to imitate Apple's aesthetic or any other design direction.

Instead:

1. Retain existing brand colors and their identity.
2. Adapt the new layouts, typography, spacing, components, visual hierarchy, and interactions around those colors.
3. Create appropriate lighter/darker shades and semantic color variants when required.
4. Ensure readable contrast in all relevant states and appearances.
5. Make only necessary color corrections when accessibility, usability, or consistency requires them.
6. Preserve existing color codes wherever they already satisfy the design requirements.

Any substantial proposed change to the existing brand palette must be justified rather than introduced silently.

### IMPLEMENTATION RULES

- Maintain one consistent design system across all pages.
- Preserve existing functionality, routes, state management, API integrations, and data flow.
- Do not unnecessarily rewrite working components.
- Avoid excessive animations, glassmorphism, shadows, gradients, and decorative elements.
- Make responsive layouts and accessibility a priority.
- Use real product-specific content and meaningful UI elements instead of generic placeholders.
- Keep design decisions intentional and explainable.

### FINAL VALIDATION

After implementation:

1. Revisit both repositories' relevant criteria.
2. Run the avoid-ai-design scanner when the environment supports it. If it is unavailable, perform a manual audit against the relevant catalog and aesthetic-direction guidance.
3. Visually inspect the implemented UI when screenshots or previews are available.
4. Check responsive behavior, accessibility, typography, colors, spacing, and consistency.
5. Verify that existing functionality remains intact.
6. Correct any significant issues found during validation.

Do not redesign an already distinctive and well-functioning interface unnecessarily.

These standards apply to relevant frontend and UI tasks, not unrelated backend, database, or algorithm work unless it directly affects the interface.

## Completion and reporting requirements

For each relevant UI task:

- Complete Phase 1 before making design changes; do not skip directly to styling.
- Keep the audit proportional to the scope, but always inspect the existing screen and its design tokens.
- Record the chosen design direction and the important generic patterns being avoided.
- Distinguish what was actually inspected, tested, scanned, and visually verified from what could not be verified in the available environment.
- Report any intentional brand-color changes and explain why they were necessary.
- Keep unrelated backend, database, algorithm, and infrastructure work out of this UI workflow unless it directly changes the interface.
