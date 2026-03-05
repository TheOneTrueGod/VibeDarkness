---
name: editing-and-creating-components
description: Guidelines for editing and creating React components in this project. Use when working on UI components (including tooltips) so they match the existing Tailwind-powered dark theme and interaction patterns.
---

# Editing and Creating Components

## When to use this skill

Use this skill whenever you:
- Add or change React components under `app/js/components/` or `app/js/games/**/components/`.
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

- **Always set an explicit background color**:
  - Do **not** rely on inherited or default backgrounds.
  - Use a Tailwind background class such as `bg-dark-900/95`, `bg-dark-800`, or `bg-black/80` so tooltips are readable in the dark theme.
  - If the tooltip overlays busy content, prefer a slightly transparent dark background (e.g. `bg-dark-900/95`) plus a subtle border.
- **Always set text and border colors**:
  - Use light text (`text-gray-100`/`text-gray-200`) on dark backgrounds.
  - Use a border (`border-dark-600`, `border-border-custom`) to visually separate from the game canvas or card bar.
- **Keep tooltip content compact**:
  - Short title line (e.g. pile name) plus 1–2 lines of explanation.
  - Lists should use small text (`text-[11px]`–`text-xs`) and tight vertical spacing.
- **Positioning**:
  - Anchor relative to the triggering element (`relative` on parent, `absolute` on tooltip).
  - Prefer positioning to the side or above/below with a margin (e.g. `left-full ml-3 top-1/2 -translate-y-1/2`) so the tooltip does not cover critical UI.

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

