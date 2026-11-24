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

**Rock damage by hit count:** `TerrainManager.damageRockByHits(col, row, hitsToBreak, source)` chips intact rock by `ceil(maxHealth / hitsToBreak)`, so content can say "breaks in N hits" whatever the rock's durability. Projectiles opt in with `rockHitsToBreak` (they must also stop at rock: `stopsAtWalls` or `collidesWithTerrain: [Rock]`); `CastBehaviours.Beam` with `rockHitsToBreak` (once per rock cell per pulse).

**Moving over rock:** forced displacement (`computeForcedDisplacement`) stops at impassable terrain, and a lunge (`LungeMovement`, every Charge) that is cut short sets `lungeStopped` on its note and stays against the wall. To carry a unit over rock instead, claim `Unit.claimFlight()` each tick of the carry: wall recovery is skipped, so structures do not shatter rock mid-path; the landing tick is on the ground again.

**Walls block light:** `TerrainProperties.blocksLight` (Rock, Impassable) stops light reaching tiles behind it; the wall tile itself is still lit, so wall faces show. `LightingSystem` owns one engine-scoped `LightOcclusionCache` (`game/lighting/lightOcclusion.ts`, masks traced with `tileLine.ts` `isTileLineClear` over `TerrainManager.blocksLightAt`, so runtime rock blocks and destroyed rock stops blocking) and passes it to `computeLightChannelGrid`; it is invalidated when `navEpoch` moves. Positive and void sources are both occluded. Gameplay reach: everything that reads the light grid — corruption, daylight damage, darkness spawns, Light Hate (`engine.getLightOcclusion()`) — now sees wall shadows too.

**Water levels:** water types carry `TerrainProperties.waterLevel` (Shallow 1, Water 2, Deep 3). Stone placed on water raises the ground instead of sitting on it: `raiseGround(type, amount)` with `GROUND_RAISE` (rock 2, gravel 1); level 0 is Gravel. `createOrMarkRock` and `createRubble` apply it, so every rock- or gravel-creating ability fills water the same way (deep + rock = shallow, water + gravel = shallow, shallow + gravel = gravel). Deep Water drowns with `drown_deep` (double damage).

**Draining water:** `TerrainManager.drainWater(col, row, fraction, sourceUnitId?)` is the counterpart of `damageRock`. A water tile's remaining water is a lazily created floor `destructible` of kind `WATER_DESTRUCTIBLE_KIND` (health `WATER_TILE_HEALTH` = 1; `fraction` is health removed). At 0 the tile drops one level through `lowerWaterLevel` (deep -> water -> shallow -> **dirt**: a drained puddle, unlike `raiseGround`'s gravel) and its water resets; at most one level per call. A level drop bumps `navEpoch` (pathfinding, terrain repaint) and emits `terrain_water_drained` (`TerrainWaterDrainedTransition`; AI path interrupts listen to it like `terrain_stone_damaged`). Partial drains return the transition but emit nothing. Stone on a part-drained tile rewrites the floor, so the new level starts full.

## Terrain variants

A variant is its own `TerrainType` (append only, never renumber: checkpoints store the numbers) that behaves as a base type. Two optional `TerrainProperties` fields drive it:

- `variantOf` - the base type (Brick -> Rock). Copy the base's gameplay properties; only name, colour and the gate differ.
- `access` - a `TerrainAccessId` a unit needs to **mutate or draw on** the tile. Omit for no gate.

Two helpers in `TerrainType.ts` answer the two questions. Never compare to `TerrainType.Rock` directly in gameplay code.

| Question | Helper | Used by |
|---|---|---|
| What is this terrain? | `baseTerrainOf(type)`, `terrainListIncludes(list, type)` | `isIntactRock`, `floorTileFromBedrock`, collision lists (`collidesWithTerrain: [Rock]` stops at Brick), `blockedOn` (`ROCK_AND_WATER_TERRAIN`), `rockHitsToBreak`, Rock Slide spawn tiles, preview priority, rock render paths |
| May this actor change or use it? | `canUnitAffectTerrain(type, access)`, `terrainListIncludesForActor(list, type, access)`, `TerrainManager.canSourceAffectRockAt / canSourceAffectTerrainAt` | `damageRock*`, `destroyRock`, `consumeRockInRadius`, `createOrMarkRock`, `isOnStone` / `isUnitOnStone` / tremorsense stone count, `TerrainStrike`, Rock Slide picks, stonephase `canTraverse`, `IntervalEmitter.terrainCondition` (Digging Claws debris) |

**The unit gate.** `Unit.terrainAccess: Set<TerrainAccessId>` is instance state (research grants it before battle; not on the def), serialized when non-empty, with `grantTerrainAccess` / `hasTerrainAccess`. `TerrainManager` looks units up through `setTerrainAccessResolver`, which the `GameEngine.terrainManager` setter wires (`unitId -> unit.terrainAccess`). Mutation APIs take a `sourceUnitId`; on gated terrain a source without access, an unknown source, or **no source** is refused (null, no change). Collision, blocking, vision, light and pathing ignore the gate. Without access Brick is indestructible rock; with access it is exactly Rock (same health, crack tiers, breaks into Gravel), and it keeps `terrainType: Brick` until it breaks. Test harness: `spawnTinyPlayerUnit` / `placePlayerAndDummy` / `placePlayerFromLoadout` take `terrainAccess: ['brick']`.

**Rendering.** A hard-edge variant gets its own `LAYER_ORDER` entry (Brick straight after Rock) and joins its base through `hardEdgeFamily` so shared edges draw no seam. `hardEdgePattern` (Brick: `'running-bond'`) adds a surface overlay in `HardEdgeLayerRenderer`, clipped to the chamfered core; pattern constants sit at the top of that file. Crack overlays come from `floorTileVisualFor` (`game/GameRenderer/floorTileVisualDefs.ts`), which matches `baseTerrainOf(type) === Rock` and keys the cache per type. Tooling: `AUTHORED_TERRAIN_TYPES`, `TerrainTypePicker`, `TERRAIN_COLORS`, `SEGMENT_PREVIEW_PRIORITY` (same as the base) and ascii (`'B'` / `B`).

**Gravel look.** Gravel is one terrain type in two layers (painted bedrock in map segments, and the floor-tile layer where broken rock and Earth Core casts leave it), and both draw identically: pale limestone `color` plus `hardEdgePattern: 'speckle'`, drawn by `HardEdgeLayerRenderer` for every effective Gravel cell, so there is no separate rubble overlay. `gravelSpeckle.ts` avoids a visible tile grid: 8 chip layouts, picked per world cell by hash, each optionally mirrored on either axis, plus a faint per-cell light or dark tint. Tune chip colours, counts and tint there. Check it at `/campaign/ideas/storybook/terrain`.

**Corner cuts.** A hard-edge cell cuts a corner when both of its sides there are another family. If those two neighbours differ (grass west, dirt north), the cut is split along the diagonal from the corner and each half matches the 2px edge strip it touches; the strip corner square is split along the same diagonal (`fillSplitCorner` `'main'` for NW/SE, `'anti'` for NE/SW). If they match, the whole cut takes the terrain that owns that grid vertex: `resolveVertexOwner` in `cornerOwner.ts` (cells that cut the same corner drop out, then the most common terrain wins, ties go to the later `LAYER_ORDER` entry, dirt if nothing reaches). So a rock in a gravel cross shows gravel corners, not the grass diagonal, and every cell at a vertex agrees. `LAYER_ORDER` lives in `terrainLayerOrder.ts`. Because owners read two cells out, `TerrainRenderer.invalidateTile` repaints a 5x5 block (`REPAINT_RADIUS`).

**Soft corners.** Marching-squares layers spread into any corner they touch, except at rock corners (`marchingSquareCase` keeps dirt from running along a wall face). Two rules keep that tidy: a layer on **both** of a cell's sides at a rock corner wraps around the rock and covers that corner (no lower-layer sliver pointing at the rock), and a cell whose four corners would all go to higher layers (`isCellFullyCoveredByHigherLayers`: a lone shallow tile in water, a one-tile grass strip between dirt rows) gets them as separate corner triangles, so it stays visible as a diamond. Check both at `/campaign/ideas/storybook/terrain?layout=water`.

**Future variants fit without new checks.** Flowers: `variantOf: Grass`, no `access`; abilities that care read `type === Flowers`. River: `variantOf: ShallowWater` plus a future push property. Neither is built yet.

## Durable terrain (Briar, Tangle)

Runtime-only types driven by two `TerrainProperties` fields, logic in `durableTerrain.ts`, mutation on `TerrainManager`. `durability` (`maxHealth`, `kind`, `becomes`): Briar has 30 health and becomes Tangle at 0; `placeBriar(tiles)` lays it (skips rock, water, off-grid, existing Briar), `damageDurableTerrain` / `damageDurableTerrainByHits` chip it. `projectileWear` (`hits`, `becomes`): Tangle (`variantOf` Thick Grass, slow, `blocksProjectiles`) counts down once per projectile stopped at it (`Projectile` wall-stop calls `wearTerrainByProjectile`) and becomes Grass after 3. State is the floor tile's `destructible` (kind from the def, or `wear`), so it serializes with `floorTiles`. Projectiles with `rockHitsToBreak` also chip Briar. Not in `AUTHORED_TERRAIN_TYPES`.

## Thorns (def-driven)

Thorn-style ground hazards (`bramble_slow`, `dark_thorn`) share one rule set: `TerrainEffectDef.thorns` in `game/terrainEffects/terrainEffectDefs.ts` (`hurts` creature filter, `enterDamage`, `landDamage`, `uses`). `game/terrainEffects/thorns.ts` (`triggerThorns`) applies it from `tileTransitions.ts` `onEnter` / `onLand`; there is no standing DoT. Both are `blockedOn: ROCK_AND_WATER_TERRAIN`: `TerrainLayerManager.add` skips rock/water cells (via the effective-terrain resolver `TerrainManager.setTerrainLayers` wires), and `TerrainManager.writeFloorTile` (every floor write) wipes them when a cell becomes rock or water. To add a variant: add a def entry with `thorns`, add a visual entry in `game/GameRenderer/terrainEffectDefs.ts`, and never rename existing effect-type strings (checkpoints store them).
