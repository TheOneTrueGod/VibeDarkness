# terrain/

Mission bedrock grid, pathfinding, and the TerrainManager façade. Mutable overlays (created rock, bramble, thorns) live on **`TerrainLayerManager`** in `game/`, not on this folder’s bedrock grid.

## Folder map

| Path | Owns |
|------|------|
| `TerrainGrid.ts` | Immutable mission bedrock cells after load. |
| `TerrainManager.ts` | Rock helpers + pathfinder; delegates floor mutations to `engine.terrainLayers`. |
| `FloorTile.ts` / related | Effective terrain = bedrock + floor-layer overrides. |
| `../pathfinding/AGENTS.md` | NavGrid, A*, GoalField, smoothing, and PathfindingManager. See that module for search/smoothing internals. |

## Layers (owned under `game/`)

| Layer | Role |
|-------|------|
| Bedrock | `TerrainGrid` — not a `TerrainLayerName`. |
| Floor | Persistent cell mods (`created_rock`, rock damage state) + `floorTiles` in checkpoints. |
| Ground | Magical ground effects (`bramble_slow`, `dark_thorn`, …). |
| Air | Reserved; few consumers yet. |

Core API: `game/TerrainLayerManager.ts` (`add` / `remove` / `removeByOwner` / movement multipliers / floor overrides). Checkpoints expose `terrainEffects` (and floor tiles) on `SerializedGameState`. `GameEngine.fromJSON` must restore `terrainLayers` **before** `terrainManager.setTerrainLayers` so pathfinding sees rocks.

Ground/air overlays: `game/GameRenderer/renderers/TerrainEffectRenderer.ts` and visuals in `game/GameRenderer/terrainEffectDefs.ts`.

## Water and terrain hazards (def-driven)

`TerrainProperties.forcedMovementPassable` says whether forced movement (knockback, lift: `computeForcedDisplacement` with `forced: true`) may carry a unit onto a tile; walking, pathfinding and self-movement (dash, lunge) still use `passable`. Water and Deep Water are the non-walkable types that allow it (Shallow Water is simply walkable at half speed). A grounded unit that enters or lands on terrain with a `forcedEntryHazard` starts that hazard (`game/terrainHazards/`): for `drown` it is untargetable (`Unit.isUntargetable`) and cannot act while it sinks, then reappears on the nearest walkable tile and takes the def's damage. To add a hazard: add an id to `TerrainHazardId`, a def in `terrainHazardDefs.ts`, and point a terrain type at it.

**Water levels:** water types carry `TerrainProperties.waterLevel` (Shallow 1, Water 2, Deep 3). Stone placed on water raises the ground instead of sitting on it: `raiseGround(type, amount)` with `GROUND_RAISE` (rock 2, gravel 1); level 0 is Rubble (gravel). `createOrMarkRock` and `createRubble` apply it, so every rock- or gravel-creating ability fills water the same way (deep + rock = shallow, water + gravel = shallow, shallow + gravel = gravel). Deep Water drowns with `drown_deep` (double damage).

## Thorns (def-driven)

Thorn-style ground hazards (`bramble_slow`, `dark_thorn`) share one rule set: `TerrainEffectDef.thorns` in `game/terrainEffects/terrainEffectDefs.ts` (`hurts` creature filter, `enterDamage`, `landDamage`, `consumeOnTrigger`). `game/terrainEffects/thorns.ts` (`triggerThorns`) applies it from `tileTransitions.ts` `onEnter` / `onLand`; there is no standing DoT. To add a variant: add a def entry with `thorns`, add a visual entry in `game/GameRenderer/terrainEffectDefs.ts`, and never rename existing effect-type strings (checkpoints store them).
