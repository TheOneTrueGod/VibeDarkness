# PixiComponents

Reusable Pixi.js UI building blocks for the Minion Battles renderer. Each component is a factory function that returns a `Container` (or primitive) with labeled children, plus a matching updater function.

**When adding a new component, add it to the list below.**

## Components

- **`createBadge(initialText, opts?)`** (`PixiComponents.ts`) — Filled circle with a centred number/text label; used for stack-count overlays and similar numeric badges.
