---
name: performance-debugging
description: How to capture and analyze Minion Battles JS performance logs (debug toggles, performanceLog shape, Lobby Archive Performance tab). Use when investigating battle lag, frame spikes, or slow ticks.
---

# Performance debugging

Capture per-tick JS timings during a battle, then inspect them live or in Lobby Archive → **Performance**.

## Capture (in battle)

Enable both Debug Console toggles (Tildes → Toggles):

1. **JS performance tracking** — engines/renderer/session record nested timings; `GameEngine.toJSON()` adds `performanceLog` when enabled.
2. **Log user state to server** — each logged tick POSTs `game_state` (including `performanceLog`) under the lobby’s `user_state/` tree.

Optional but useful with dense time series:

- **Console log every tick** — dumps full `toJSON()` (with `performanceLog`) to the browser console; heavy; use for short repros.

Tracker implementation: `app/js/games/minion_battles/game/performance/tickPerformanceTracker.ts`.  
Toggle wiring: `app/js/debug/debugSettingsStore.ts`, Debug Console Toggles tab.

Without both toggles, the Performance archive tab will show user states with **no** `performanceLog` samples (or no user state at all). Live Debug Console Performance only needs **JS performance tracking**.

## What is in `performanceLog`

Attached on serialized game state for the **last completed game tick** (ms). Nested categories; every node has `totalTimeTaken`. Parents are inclusive of children. Root includes `description: 'time taken for the last gameTick'`.

Typical top-level shape (children evolve as instrumentation grows — read the tracker path constants and call sites):

- `engine` — `fixedUpdate` / sim work (`orders`, `units`, `projectiles`, `effects`, `lighting`, …) plus `renderTick` visual effect updates on the engine rAF
  - `engine.units` further splits into `passives`, `abilities`, `resources`, `occupancy`, `movement`, `ai`, `ninjutsu`, `targets` (see `UnitManager.gameTick`)
- `ui.react` — BattleSession listener emit handling
- `ui.canvas` — CPU sync of battle sprites/layers, then `pixiPresent` (Pixi stage → screen)
  - Layer sync: `terrain`, `overlay`, `floorTiles`, `terrainEffects`, `units`, `specialTiles`, `lightSources`, `projectiles`, `effects`, `previews`, `mapNetwork`
  - `pixiPresent` → Pixi `app.render()` / `renderer.render({ container: stage })` runner phases: `prerender`, `renderStart`, `webgl` (main draw), `renderEnd`, `postrender`. Exclusive ms on `pixiPresent` is mostly transform/options setup before those runners.

Canvas frames between ticks accumulate into the next finalized tick. Fingerprints ignore this field; `fromJSON` does not restore it.

## Live Debug Console (in battle)

With **JS performance tracking** on, Debug Console → **Performance** keeps the last 50 ticks in a client-only ring (`PERFORMANCE_HISTORY_CAPACITY`; not serialized). Stacked-area chart + category table support breadcrumb drill-down into nested `performanceLog` paths. See `DebugPerformanceTab` and `tickPerformanceTracker.getHistory()`.

## Where logs live

| Source | What | Archive UI |
|--------|------|------------|
| `storage/lobbies/<id>/user_state/<playerId>/` | Per-tick `game_state` (+ optional `performanceLog`) | User States + **Performance** |
| `lobby_log.jsonl` | Sync/desync/debug text lines | Lobby Log (not the Performance charts) |
| Checkpoints / snapshots | Host `saveBattleSnapshot` state | Game State (may include `performanceLog` if tracking was on at save) |

API for ranges: `LobbyClient.getAdminLobbyUserStateIndex`, `getUserStateRange`. Aggregation helpers: `LobbyArchive/performanceArchive.ts`.

## Analyze (Lobby Archive → Performance)

Open Campaign Home → Lobby Archive → select lobby → **Performance**.

- Loads that player’s user-state ranges in **25-tick windows** (same size as User States batches).
- Charts: total ms over tick; stacked engine vs UI; per-window avg / p95 / max bars.
- Select a window for spike tick + category averages (path depth ≤ 2).

Workflow:

1. Reproduce lag with both toggles on.
2. Open Performance; pick the player who logged (host first).
3. Find windows with high **max** / **p95**, then the **spike tick**.
4. In User States, open that tick and expand `game_state.performanceLog` for the full nested tree.
5. Map hot categories to code via the tracker constants / instrumentation sites (`GameEngine.fixedUpdate`, `GameRenderer.render`, `BattleSession.emit`).

## Adding more timings

Use `tickPerformanceTracker.measure([...path], fn)` or `begin`/`end` only when tracking is enabled (no-op otherwise). Prefer existing path constants in `tickPerformanceTracker.ts`. Finalize happens at the end of each completed `fixedUpdate` before checkpoint / tick-log serialization.
