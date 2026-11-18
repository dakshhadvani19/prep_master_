# Light Theme Styling Layer

## Purpose

This branch rebuilds the light appearance from the visual language in [harsh-joshi03/project](https://github.com/harsh-joshi03/project), while keeping PrepMaster's current `main` branch as the source of truth for page structure and layout geometry.

## Implementation

- `global-exam-prep/src/styles/LightThemeBase.css` contains the reference palette, typography, global surface treatments, shared component colors, navbar/footer visual treatment, and shared effects.
- `global-exam-prep/src/styles/LightThemePages.css` contains route-specific visual rules extracted from the reference page stylesheets.
- Both layers are scoped to `:root[data-theme="light"]`.
- Reference keyframes are retained with a `pm-light-` prefix so light-mode animation names do not replace the dark theme's original keyframes.
- `ThemeContext.jsx` stores the user's theme preference and displays a loading overlay only when switching exceeds 500 ms.
- `Layout.jsx` adds the appearance toggle and shared footer without changing existing routes or the page content structure.

## Layout preservation rule

The reference extraction intentionally excludes page-level margin, padding, display, positioning, dimensions, grid, flex and gap declarations. These remain in PrepMaster's original `main` stylesheets. The only geometry copied from the reference is for the newly introduced footer and decorative pseudo-elements, which do not change existing page layout.

Typography keeps the reference font families, weights and letter spacing, but keeps PrepMaster's existing font sizes to minimize text-flow and layout shifts.

## Known follow-up

The custom PrepMaster subscriptions page does not exist in the reference repository. Its light-mode visual treatment is intentionally left for a separate design pass. Other component-specific edge cases should be reviewed route by route before merging into `main`.

## Deployment safety

This work is kept on the isolated `light-theme` branch. It is not merged into `main` and does not change the production deployment.
