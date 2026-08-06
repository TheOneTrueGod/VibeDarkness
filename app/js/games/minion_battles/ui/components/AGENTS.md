# Minion Battles — UI components

Reusable React widgets for battle and lobby-adjacent Minion Battles UI. Paths below are relative to `app/js/games/minion_battles/ui/components/`.

## Folder map

| Area | Purpose |
|------|---------|
| Root (`*.tsx`) | Shared battle/lobby widgets (ability slots, tooltips, timeline, portraits). |
| `battleUiSlots/` | Fixed shell regions for the battle HUD (ability bar, etc.). |
| `CharacterEditor/` | Campaign character editor tabs and panels. |
| `resources/` | Resource / cost icons and unit resource panel. |
| `boss/` | Boss fight HUD pieces. |

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
