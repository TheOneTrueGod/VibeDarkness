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

When you introduce a **new** `characterId`, add its baseline row in `game/units/unit_defs/unitDef.ts` and set optional **`creatureType`** (`dark_creature` | `beast`) when the category is obvious from `writing-style-enemies/STYLE.md`; if not obvious, **ask the user** before committing.

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
  - Uses `ctx.getLightAt(col, row)` — the **animated visual grid** — so a tile is only a valid spawn candidate when it is visually dark to the player, not merely when a light source has logically departed. See `game/lighting/AGENTS.md` for the two-grid distinction.
  - A tile counts as "full darkness" when `lightLevel == DarknessLevel.FULL_DARKNESS` (0).
  - **Do not switch this to `getLightGrid(getAllLightSources())`** (the instantaneous target) — that causes units to spawn in tiles that still appear lit because the animated grid hasn't caught up yet.

- **`spawnBehaviour: 'closest'`**
  - Scans Chebyshev rings outward from the **average position of all living player units**.
  - Returns the N nearest passable, unoccupied tiles (one per unit when `spawnCount > 1`).
  - Stops scanning when the ring is entirely off the map.
  - Optional `closestConfig: { inDarkness?: boolean }` restricts candidates to full-darkness tiles.
  - Does **not** use `spawnTarget`. Not randomised — always picks the geometrically closest tiles.
  - Use this for "spawn near the players" patterns (ambushes, reinforcements that close in).

- **`spawnBehaviour: 'network_nearest_owned_leaf'`**
  - Finds the **leaf node** (a `MapNetworkManager` node with at most one edge — a dead end of the
    mission's node graph, e.g. the far end of a nest chain) that is **owned** (has a unit sitting
    in its radius, per `MapNetworkManager.getOwnerCharacterId`) and closest to any living player.
  - Optional `networkNearestOwnedLeafConfig`:
    - `ownerCharacterIds?: string[]` — the "type of node" filter: only leaf nodes currently owned
      by one of these characterIds are eligible (e.g. `['swarm_nest', 'swarmling']` to target
      swarmling-held nests specifically). Omit to match any owned leaf node.
    - `maxDistance?: number` — max distance (in tiles) from the nearest living player for a leaf
      node to be eligible; farther nodes are ignored. Omitted = no cap.
    - `radius?: number` — spawn radius (in tiles) around the chosen node's cell. 0 (default) =
      only that cell.
    - `inDarkness?: boolean` — require the spawn tile(s) to be in full darkness.
  - If no leaf node matches the owner/distance filters, or the resolved cell(s) aren't valid spawn
    tiles, the entry is **skipped** with a `console.warn` — not a crash.
  - Use this to make reinforcements emerge from a faction's own nest network (e.g. swarmling
    waves spawning near the swarm's held nest) instead of a generic map-wide POI.

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

## Dark-creature faction spawn convention

Units with `creatureType: 'dark_creature'` (wolves, swarmlings, thornbinders, etc.) should **always** use `enemySpawnPointConfig: { inDarkness: true }` when `spawnBehaviour` is `'closestEnemySpawnPoint'`, `inDarkness: true` on `closestConfig` when `spawnBehaviour` is `'closest'`, and `inDarkness: true` on `networkNearestOwnedLeafConfig` when `spawnBehaviour` is `'network_nearest_owned_leaf'`. Dark creatures emerging from lit areas breaks the lore and visual grammar of the darkness threat. Only omit this if a specific design note explicitly calls for it.

## `closestEnemySpawnPoint` details

- Finds all `type: 'enemySpawn'` POIs registered for the mission's segments.
- Picks the POI closest to any living player unit (world-space distance).
- Optional `enemySpawnPointConfig`:
  - `matchesTags?: string[]` — restrict to POIs whose `tags` contain all listed values.
  - `radius?: number` — treat the POI as a circle of that tile radius instead of a single cell.
  - `inDarkness?: boolean` — when `true`, the chosen POI cell (or tiles within `radius`) must be in full darkness; if not, the spawn is skipped with a warning.
- If no eligible POIs exist, or the chosen POI is not passable/occupied (radius 0) or has no valid dark tiles (inDarkness + radius), the entry is **skipped** with a `console.warn` — not a crash.

## Examples

See existing mission files under `app/js/games/minion_battles/storylines/**/missions/` for spawn entry examples using different behaviours and targets.
