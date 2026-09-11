---
name: components-for-the-ui
description: Reference for reusable UI components in the project. This skill maintains a list of component names and a one-line description of what they do.
---

# Components for the UI

This skill keeps a **list of component names** and a **one-line description** of what each does. Use it when you need to reuse or extend existing UI building blocks.

## Component list

| Component | Description |
|-----------|-------------|
| **CharacterPortrait** | Renders a character/NPC portrait from an SVG string in a fixed aspect-ratio (1:1) box; accepts configurable `size` presets (small / medium / large), scales and centers the SVG. |
| **CharacterEditor** | In-place editor for a campaign character: portrait carousel, name, and Equipment tab with doll and inventory grid (drag-to-equip). |
| **CharacterCreator** | Modal for creating a new campaign character: portrait carousel and Create button. |
| **VNTextBox** | Visual-novel style dialogue/choice box used in the pre-mission story phase. |
| **PlayerPill** | Two-line player pill: color dot, name, HOST badge, (You); optional second line (e.g. selected character). Used in PlayerList and character select. |
| **AppTitleBar** | Lobby overlay for **DebugConsoleToggle** + **MusicPlayer**. Campaign home owns those plus logout in **CampaignHomeHeader**. |
| **MusicPlayer** | Compact cassette-style transport (play/pause, skip, readout, volume, mute) in a boxed group. Lives in the campaign-home header; lobby overlay via AppTitleBar. |
| **CiStatusPill** | Small gray/green/red circle showing local CI health from `/api/admin/ci-status`; admin-only hover tooltip with pass/fail counts. Compact size matches the music player when embedded in CampaignHomeHeader. |
| **DebugConsoleToggle** | 26×26 header **Debug** control (bug icon) that opens the debug drawer. Shown only after tilde ×3 unlocks debug mode. |
| **CornerSlotBattleDetails** | Top-right battle canvas rack for world modifiers, admin ninjutsu pools, and the debug game-tick pill. |
| **CardWithTitle** | Full-size titled card (`title`, optional `subtitle` / `actions`, children in a vertically scrolling body). Fills its parent; white text + `bg-surface`. Max width belongs on the parent wrapper. Lives in `app/js/components/`. |
| **CharactersTabLayerOne** | Campaign-home character chrome: name, portrait, remaining-endurance bar, Change Characters with cycle arrows, left-column switch, URL-owned inner-tab bar. Lives in `CampaignHomeScreen/CharactersTab/`. |
| **CharacterEnduranceBar** | Remaining endurance under the character portrait: red heart + borderless red rounded bar on black. Lives in `CharacterEditor/`. |
| **CharactersTabLayerTwo** | Campaign-home character right panel; dispatches to MissionMap / Upgrades / StatBonuses / Equipment. |

## When to use

- Picking a component to reuse (e.g. use **CharacterPortrait** anywhere you show a portrait).
- Adding or changing UI that should stay consistent with existing patterns.
- Documenting a new reusable component: add a row to the table above.
