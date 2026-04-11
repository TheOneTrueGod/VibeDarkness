---
name: modifying-spawn-definitions
description: Edit Minion Battles mission spawnWave definitions (SpawnWaveEntry), including spawnBehaviour, spawnTarget, and spawnCount. Use when adjusting enemy spawn locations, darkness-based spawns, or random spawn behaviour.
---

# Modifying Spawn Definitions

## When to use this skill

Use this skill when:
- Editing mission spawn waves in `app/js/games/minion_battles/storylines/**/missions/*.ts`
- Changing how and where enemies appear during a battle (`spawnWave` level events)
- Working with `spawnBehaviour`, `spawnTarget`, or `spawnCount` on `spawnWave.spawns`

## Key types and locations

- Mission config and level events: `app/js/games/minion_battles/storylines/types.ts`
  - `LevelEventSpawnWave`: defines `type`, `trigger`, and `spawns: SpawnWaveEntry[]`
  - `SpawnWaveEntry`: defines `characterId`, optional overrides (`name`, `hp`, `speed`, `aiSettings`), and spawn controls (`spawnBehaviour`, `spawnTarget`, `spawnCount`). See `types.ts` for valid `characterId` values and full field definitions.

## Behaviour semantics

- **Defaults (backwards compatible)**:
  - If `spawnBehaviour` is omitted → treated as `'edgeOfMap'`
  - If `spawnCount` is omitted → treated as `1`
  - If `spawnTarget` is omitted → no positional restriction beyond behaviour rules

- **`spawnBehaviour: 'edgeOfMap'` (default / legacy)**
  - All edge-of-map spawns in the wave are grouped.
  - Total requested units = sum of `spawnCount` for entries with this behaviour.
  - Engine calls `getEdgePositions(totalCount)` and assigns positions in order.
  - Use this when you want classic perimeter reinforcement waves.

- **`spawnBehaviour: 'anywhere'`**
  - Picks random **passable** tiles anywhere in the grid.
  - If `spawnTarget` is present, only tiles whose **cell center** lies inside the target circle are considered.
  - Each unit is placed on a unique tile within the wave (no duplicate tiles).

- **`spawnBehaviour: 'darkness'`**
  - Same rules as `'anywhere'`, but restricted to tiles in **full darkness**.
  - Darkness is computed from mission light config and `specialTiles`.
  - A tile counts as "full darkness" when its light level is very low, matching how the renderer hides enemies in the darkness overlay.

## spawnTarget and spawnCount details

- **`spawnTarget`**
  - Shape: `{ x, y, radius }` — `x`, `y` are world-space coordinates; `radius` is in **tiles** (engine multiplies by tile size).
  - Used together with `'anywhere'` or `'darkness'` to focus spawns near a point.

- **`spawnCount`**
  - Number of units to **attempt** spawning for that entry.
  - If there are fewer valid tiles than requested, the engine spawns as many as possible and logs a `console.error`.

## Determinism and error handling

- **Deterministic RNG**: All random choices use the engine's deterministic RNG (`generateRandomInteger`). Do **not** introduce `Math.random()` in spawn logic.
- **Impossible conditions**: If no tiles satisfy the constraints, the entry is skipped with a `console.error`. If the entire wave cannot run, it is skipped rather than partially spawning.

## Examples

See existing mission files under `app/js/games/minion_battles/storylines/**/missions/` for spawn entry examples using different behaviours and targets.
