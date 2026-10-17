# Minion Battles — UI components

Reusable React widgets for battle and lobby-adjacent Minion Battles UI. Paths below are relative to `app/js/games/minion_battles/ui/components/`.

## Folder map

| Area | Purpose |
|------|---------|
| Root (`*.tsx`) | Shared battle/lobby widgets (ability slots, tooltips, timeline, portraits). **MusicPlayer** is the compact cassette-style transport (campaign header; lobby overlay). |
| `battleUiSlots/` | Fixed shell regions for the battle HUD (ability bar, canvas top-right details). |
| `CharacterEditor/` | Campaign character editor tabs and panels. |
| `characters/` | Campaign-home Characters tab: list pull-out, character cards, campaign data. |
| `resources/` | Resource / cost icons and unit resource panel. |
| `boss/` | Boss fight HUD pieces. |
| `objectivesPopover/` | Mission objectives popover (see below). |

## Tooltips (use these — do not hand-roll portals)

| Component | Role |
|-----------|------|
| **AnchoredPortalTooltip** | Base portaled tooltip. Positions from an `anchorRef`, auto-flips sides / clamps to the viewport so tips stay visible, and always applies `PORTAL_TOOLTIP_SURFACE_CLASS`. Placement math lives in `portalTooltipPlacement.ts`. |
| **AbilityTooltip** | Ability title + lines (legacy `{tokens}` or `segmentLines`). Desktop path requires `anchorRef` and renders through **AnchoredPortalTooltip**; mobile uses a bottom overlay. |

For hover help elsewhere, prefer **AnchoredPortalTooltip** (or **AbilityTooltip** for ability copy). See also the **components-for-the-ui** and **editing-and-creating-components** skills.

## Ability card chrome

| Component | Role |
|-----------|------|
| **AbilitySlot** | Full ability bar card (uses, costs, hover tooltip via AbilityTooltip). |
| **AbilitySlotPreview** | Character-select / Quest Prep wrapper around AbilitySlot with fake full uses; pass `tooltipContext` for research-aware tooltips. |

## HUD anchors and the objectives popover

| File / folder | Role |
|---------------|------|
| `hudAnchors.ts` | Registry of real **DOM** elements (`useHudAnchorRef` to register, `getHudAnchorRect` to read). Use it when something must fly to or from a React-rendered panel. `registerHudFlightTarget` is for the Pixi HUD and is clipped to the canvas, so it cannot reach sidebar DOM; prefer the anchor registry for anything outside the canvas. Add new ids to `HudAnchorId`. |
| `objectivesPopover/` | `ObjectivesPopover` (portaled to `document.body`, FLIP flight between screen centre and the `objectives` anchor, falling back to a canvas-corner rect when the panel is hidden), `objectivePresentation.ts` (pure diff + reducer + tunable timings, no sim state), `objectivesPopoverGeometry.ts` (flight math). State is driven by `ui/pages/battlePhase/useObjectivesPresenter.ts`, which diffs polled `getBattleObjectiveRows()` snapshots and gates the victory hand-off in `BattlePhase`. |

`OBJECTIVES_POPOVER_ENABLED` (in `objectivePresentation.ts`) is a global kill switch: set it `false` and the popover never renders, victory forwards immediately, and the plain sidebar panel is all that remains. A mission can opt out of the start-of-mission intro only with `objectivesIntro: false` (see the **missions** skill).
