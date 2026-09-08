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
| **PlayerTile** | Battle timeline player name chip: `tiny` (coloured border/background + HOST) or `small` (full row with order-status lamp, name, optional WebRTC wifi icon). Used in `BattleTimeline` rail headers. |
| **MissionIdBadge** | Header mono pill for `selectedMissionId`; shown only for admins or when the debug console is open. Lives in `app/js/components/`. |
| **CardWithTitle** | Full-size titled card (`title`, optional `subtitle` / `actions`, children in a vertically scrolling body). Fills its parent; white text + `bg-surface`. Max width belongs on the parent wrapper. Lives in `app/js/components/`. |
| **CharactersTabLayerOne** | Campaign-home character chrome: name, Lucide portrait arrows, Change Characters, left-column switch, URL-owned inner-tab bar. Lives in `CampaignHomeScreen/CharactersTab/`. |
| **CharactersTabLayerTwo** | Campaign-home character right panel; dispatches to MissionMap / Upgrades / StatBonuses / Equipment. |

| **CampaignCharacterCard** | 200×200 card for a player character: portrait, name footer, delete button, disallow-reason diagonal, per-player color dots. Lives in `ui/pages/characterSelect/`. |
| **CharacterOverview** | Left-portrait + right-ability-cards overview shown when a character is selected. Lives in `ui/pages/characterSelect/`. |
| **CharacterGrid** | Auto-fill grid of 200px character/option cards for the character-select screen. Lives in `ui/pages/characterSelect/`. |
| **ITSTimelineControls** | Fixed-height ITS Reset / Replay / Done icon row with a live frame-stepper; replaces “Your Turn” text in the turn indicator during playahead. |
| **ITSTimelineFrameStepper** | Compact passed / current / future pip bar for ITS playahead progress. |
| **AnchoredPortalTooltip** | Portaled tooltip from an anchor; auto-flips / clamps to stay in the viewport; always includes opaque `bg-black` surface chrome via `PORTAL_TOOLTIP_SURFACE_CLASS`. Lives in `minion_battles/ui/components/`. |
| **AbilityTooltip** | Ability name + description lines; desktop uses **AnchoredPortalTooltip** (`anchorRef` required); mobile bottom overlay. Lives in `minion_battles/ui/components/`. |
| **AbilitySlot** | Ability bar card with uses/costs and hover tooltip. Lives in `minion_battles/ui/components/`. |
| **AbilitySlotPreview** | Character-select / Quest Prep AbilitySlot wrapper with fake full uses + shared portaled tooltips. Lives in `minion_battles/ui/components/`. |
| **MusicPlayer** | Compact cassette-style transport (play/pause, skip, readout, volume, mute) in a boxed group. Lives in the campaign-home header; lobby overlay via AppTitleBar. |

## When to use

- Picking a component to reuse (e.g. use **CharacterPortrait** anywhere you show a portrait).
- Adding or changing UI that should stay consistent with existing patterns.
- Documenting a new reusable component: add a row to the table above.
