---
name: components-for-the-ui
description: Reference for reusable UI components in the project. This skill maintains a list of component names and a one-line description of what they do.
---

# Components for the UI

This skill keeps a **list of component names** and a **one-line description** of what each does. Use it when you need to reuse or extend existing UI building blocks.

## Component list

| Component | Description |
|-----------|-------------|
| **CharacterPortrait** | Renders a character/NPC portrait from an SVG string in a fixed aspect-ratio (1:1) box; accepts `size` (small 96px / medium 180px / large 240px), scales and centers the SVG. |
| **CharacterEditor** | In-place editor for a campaign character: portrait carousel, name, and Equipment tab with doll and inventory grid (drag-to-equip). |
| **CharacterCreator** | Modal for creating a new campaign character: portrait carousel and Create button. |
| **VNTextBox** | Visual-novel style dialogue/choice box used in the pre-mission story phase. |
| **PlayerPill** | Two-line player pill: color dot, name, HOST badge, (You); optional second line (e.g. selected character). Used in PlayerList and character select. |

## When to use

- Picking a component to reuse (e.g. use **CharacterPortrait** anywhere you show a portrait).
- Adding or changing UI that should stay consistent with existing patterns.
- Documenting a new reusable component: add a row to the table above.
