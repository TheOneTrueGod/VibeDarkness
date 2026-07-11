---
name: editing-and-creating-components
description: Guidelines for editing and creating React components in this project. Use when working on UI components (including tooltips) so they match the existing Tailwind-powered dark theme and interaction patterns.
---

# Editing and Creating Components

## When to use this skill

Use this skill whenever you:
- Add or change React components under `app/js/components/` or `app/js/games/**/ui/components/`.
- Introduce new interactive UI (buttons, panels, tooltips, overlays) in the lobby or game UIs.
- Tweak layout or styling of existing components.

## General component guidelines

- **Stick to functional components**: Use React function components with hooks, no class components.
- **Use Tailwind for styling**: Prefer Tailwind utility classes over custom CSS. Reuse existing color tokens (e.g. `bg-dark-900`, `bg-surface-light`, `border-border-custom`, etc.) to stay on theme.
- **Dark-theme first**: Assume a dark background. Ensure:
  - Sufficient contrast between text and background.
  - Borders on dark-on-dark surfaces (`border-dark-600`, `border-border-custom`) for separation.
  - Hover states are visible but not overly bright.
- **Layout and spacing**:
  - Use flexbox (`flex`, `items-center`, `justify-between`, `gap-*`) for layout.
  - Keep vertical and horizontal padding consistent with nearby elements.
  - Align new controls with existing ones (e.g. card bars, headers).

## Tooltip and hover box rules

When adding or editing **tooltips, hover boxes, popovers, or any floating help UI**:

- **Prefer the shared helper**: use `AnchoredPortalTooltip` from `ui/components/AnchoredPortalTooltip.tsx`. It always applies `PORTAL_TOOLTIP_SURFACE_CLASS` (`bg-black` + border + light text), so a missing background cannot slip through.
- **Inline tooltips** (no portal): import and include `PORTAL_TOOLTIP_SURFACE_CLASS` on the tooltip element. Do not hand-roll background classes.
- **Never invent theme colors**: only use tokens that exist in `tailwind.config.js` (`bg-black`, `bg-dark-900`, `bg-surface`, `border-border-custom`, etc.). A class like `bg-dark-900` only works because `dark` is defined there — if Tailwind does not know the color, the class is silently dropped and the tooltip looks transparent.
- **Always set text and border colors** (already covered by `PORTAL_TOOLTIP_SURFACE_CLASS` when using the helper).
- **Keep tooltip content compact**:
  - Short title line (e.g. pile name) plus 1–2 lines of explanation.
  - Lists should use small text (`text-[11px]`–`text-xs`) and tight vertical spacing.
- **Positioning**:
  - Prefer `AnchoredPortalTooltip` so overflow-hidden parents cannot clip the tip.
  - For rare inline tips: `relative` on parent, `absolute` on tooltip.

## Interaction patterns

- **Hover vs click**:
  - Desktop-only hints can use `onMouseEnter` / `onMouseLeave` to show/hide tooltips.
  - If a tooltip contains important information for gameplay, consider a click/tap-based affordance for mobile (separate from this skill; coordinate with game UX).
- **Accessibility basics**:
  - Use `title` attributes for simple one-line hints.
  - For richer content, render actual tooltip elements with screen-readable text, not only icons.

## Consistency with existing UI

- Match surrounding components:
  - Reuse existing class patterns from nearby elements (progress bars, card bars, sidebars).
  - Align font sizes (`text-xs`, `text-sm`) and padding with peers unless there is a strong reason to differ.
- When in doubt:
  - Look at similar components in the same area and copy their structure and base classes, then adapt as needed.

## After edits

- Run `npx tsc --noEmit` when types or interfaces changed.
- Run **`npm run lint`** first, then the **minimal** Vitest scope (see **scoped-testing** skill): new/edited `*.test.ts`, then `npx vitest related <file> --run`, then `npx vitest run --changed` only if needed. Do **not** run the full suite after every UI tweak — **`npm run ci`** covers that on a schedule.

