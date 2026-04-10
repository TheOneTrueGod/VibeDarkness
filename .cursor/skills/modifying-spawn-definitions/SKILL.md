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
  - `LevelEventSpawnWave`:
    - `type: 'spawnWave'`
    - `trigger: { atRound } | { afterSeconds }`
    - `spawns: SpawnWaveEntry[]`
  - `SpawnWaveEntry` fields:
    - `characterId: 'enemy_melee' | 'enemy_ranged' | 'dark_wolf' | 'alpha_wolf' | 'boar'`
    - Optional overrides: `name`, `hp`, `speed`, `aiSettings`
    - **New spawn controls**:
      - `spawnBehaviour?: 'edgeOfMap' | 'darkness' | 'anywhere'`
      - `spawnTarget?: { x: number; y: number; radius: number }`
      - `spawnCount?: number`

## Behaviour semantics

- **Defaults (backwards compatible)**:
  - If `spawnBehaviour` is omitted → treated as `'edgeOfMap'`
  - If `spawnCount` is omitted → treated as `1`
  - If `spawnTarget` is omitted → no positional restriction beyond behaviour rules

- **`spawnBehaviour: 'edgeOfMap'` (default / legacy)**
  - All edge-of-map spawns in the wave are grouped.
  - Total requested units = sum of `spawnCount` for entries with `'edgeOfMap'`.
  - Engine calls `getEdgePositions(totalCount)` and assigns positions in order.
  - Use this when you want classic perimeter reinforcement waves.

- **`spawnBehaviour: 'anywhere'`**
  - Picks random **passable** tiles anywhere in the grid.
  - If `spawnTarget` is present:
    - `x`, `y` are **world coordinates**, center of the target area.
    - `radius` is measured in **tiles**; engine converts to pixels via cell size.
    - Only tiles whose **cell center** lies inside that circle are considered.
  - Each unit is placed on a unique tile within the wave (no duplicate tiles).

- **`spawnBehaviour: 'darkness'`**
  - Same rules as `'anywhere'`, but restricted to tiles in **full darkness**.
  - Darkness is computed from mission light config and `specialTiles`:
    - Mission: `lightLevelEnabled`, `globalLightLevel`
    - Tile lighting: `lightEmission` / `lightRadius` on special tile defs
  - A tile counts as "full darkness" when its light level is very low (e.g. ≤ -20),
    matching how the renderer hides enemies in the darkness overlay.

## spawnTarget and spawnCount details

- **`spawnTarget`**
  - Shape: `{ x: number; y: number; radius: number }`
  - `x`, `y`: world-space coordinates (same units as unit positions).
  - `radius`: in **tiles**; engine multiplies by tile size to build a pixel radius.
  - Used together with `'anywhere'` or `'darkness'` to focus spawns near a point.

- **`spawnCount`**
  - Number of units to **attempt** spawning for that entry.
  - Engine:
    - Gathers all valid tiles for that entry’s behaviour/target.
    - Uses deterministic RNG to pick up to `spawnCount` distinct tiles.
    - If there are fewer tiles than requested, it:
      - Spawns as many units as possible.
      - Logs a `console.error` noting requested vs available count.

## Determinism and error handling

- **Deterministic RNG**
  - All random choices use the engine’s deterministic RNG (`generateRandomInteger`),
    seeded by `randomSeed` which is serialized in `SerializedGameState`.
  - **Do not** introduce `Math.random()` or non-deterministic sources in spawn logic.

- **Impossible conditions**
  - If no tiles satisfy the constraints for an entry (e.g. no dark tiles in range),
    that entry is **skipped** and a `console.error` is emitted.
  - If the entire wave cannot run (e.g. missing `terrainManager`), the wave is
    skipped with an error, rather than partially spawning in an inconsistent way.

## Example spawn entry

```ts
{
  characterId: 'dark_wolf',
  spawnBehaviour: 'darkness',
  spawnTarget: { x: 80, y: 50, radius: 8 },
  spawnCount: 4,
}
```

- Tries to spawn **4 dark wolves** on distinct, passable tiles whose centers:
  - Are within 8 tiles (in world distance) of `(80, 50)`, and
  - Are in full darkness.
- If only 3 valid tiles exist:
  - 3 wolves are spawned on those tiles.
  - A `console.error` notes that only 3 of 4 requested spawns were possible.

