---
name: debug-console
description: Explains how the DebugConsole drawer and its tabs work in the VibeDarkness UI.
---

# Debug Console

## What it is

`DebugConsole` is a collapsible in-game drawer that can be toggled with the tilde key. When enabled, it displays structured JSON views of:
- current battle/game state
- the local player's account data
- campaign data
- character data and character details
- (optionally) Minion Battles unit inspection with debug hover integration

The console is implemented as a main controller component plus one component per tab under `app/js/components/DebugConsole/`.

## How it is toggled

1. A global `keydown` listener watches for the tilde key.
2. Pressing tilde three times quickly enables debug mode (and resets the internal counter).
3. Pressing tilde again disables debug mode.

The debug UI is only visible while debug mode is enabled, but the component keeps its internal state while it stays mounted.

## Tabs and lazy loading

Tabs are managed by the main controller (`DebugConsole/DebugConsole.tsx`) via an `activeTab` state. Each tab component is responsible for:

- determining what it needs to fetch when it becomes active
- performing any one-time “load on first open” behavior
- rendering loading/error/empty states

Lazy loading rules by tab:
- Game state tab: no network calls; it renders from the `gameState` prop.
- Player data tab: fetches player account data the first time the tab is opened.
- Campaign data tab: fetches campaign state the first time the tab is opened.
- Characters tab:
  - fetches the character list the first time the tab is opened
  - renders a selectable list
  - fetches character details whenever the selected character changes while the tab is active
- Units tab (battle only):
  - reads the unit list from `gameState`
  - lazily loads portrait rendering helpers when the tab is opened

## Units tab integration details

The Units tab bridges UI hover to the Pixi world:
- When hovering a unit in the list, the tab calls a global hover function to show a focus/outline in the battle canvas.
- When the user stops hovering, or when the tab becomes inactive, the tab clears the hover highlight.
- When leaving battle mode entirely, the Units tab clears selection/expansion state and clears any pending hover highlight.

Portrait rendering is also lazy:
- Portrait helper code is loaded on demand when entering the Units tab.
- If portrait code fails to load, the UI falls back to placeholders (e.g. initials) rather than blocking the tab.

## Edge cases to consider

1. Leaving battle / losing admin:
   - If the active tab would no longer be valid (e.g. switching out of battle while on Units, or losing admin while on Battle Actions), the main controller switches back to a safe tab.
   - The Units tab itself also clears state when battle context is no longer present.

2. Debug mode turned off:
   - Disabling debug mode hides the drawer but does not necessarily clear fetched data inside the tab components.
   - Re-enabling debug mode typically restores the last tab and last loaded data.

3. Hover highlight “getting stuck”:
   - The console clears hover when leaving the Units tab and when battle ends, so the Pixi world highlight does not remain active after navigation.

4. Global hover function availability:
   - The hover bridge relies on a global function that is created/removed by the battle phase code.
   - If the user opens Units while that function is not available, hover calls safely become no-ops.

5. API returning empty or null values:
   - The “load once” logic uses internal “attempt” flags to prevent accidental re-fetch loops when the API returns no data.
   - Errors are surfaced in the tab UI and stop further auto-retries until the user reopens the tab (or until tab state resets for that tab).

6. Keyboard interaction while typing:
   - The tilde toggle is global and may trigger while the user is interacting with other UI elements or text fields.
   - If you add more keyboard handling, be careful not to conflict with this global toggle behavior.

7. Characters tab access:
   - The characters tab uses a visual “dim/gray” state to indicate it will load on open, but it should remain clickable.
   - If you change “disabled” vs “dimmed” styling, ensure the first-open path still works.

## Where to edit

- Main controller: `app/js/components/DebugConsole/DebugConsole.tsx`
- Shared debug UI pieces: `app/js/components/DebugConsole/*`
- Tabs:
  - `app/js/components/DebugConsole/tabs/DebugBattleActionsTab.tsx`
  - `app/js/components/DebugConsole/tabs/DebugGameStateTab.tsx`
  - `app/js/components/DebugConsole/tabs/DebugOrdersTab.tsx`
  - `app/js/components/DebugConsole/tabs/DebugUnitsTab.tsx`
  - `app/js/components/DebugConsole/tabs/DebugPlayerDataTab.tsx`
  - `app/js/components/DebugConsole/tabs/DebugCampaignDataTab.tsx`
  - `app/js/components/DebugConsole/tabs/DebugCharactersTab.tsx`

