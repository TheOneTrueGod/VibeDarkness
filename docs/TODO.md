# TODO

## Uncategorised

| Todo | Notes |
|------|-------|

## Trivial

| Todo | Notes |
|------|-------|

## Easy

| Todo | Notes |
|------|-------|

## Medium

| Todo | Notes |
|------|-------|
| Clean up discard duration | Discard duration is confirmed to run on world time (`engine.gameTime`). Consolidate its semantics with ability uses/cooldowns (one shared recovery clock and docs) so time dilation behaves consistently. |
| Express death-sequence `storyPause` as a Time Stop | `applyDeathSequence` uses `engine.startStoryPause`. Consider `engine.startTimeStop` with exempt actors so cinematics use tick time and world pace instead of pausing the engine; see `game/time/AGENTS.md` and `game/deathSequences/AGENTS.md`. |
| Use network nodes as route hints for all pathfinding AI | Grass and Dirt have the same `pathfindingWeight`, so A* ignores roads and long routes cut across open grass; only the three network AI trees follow roads, by hopping between map-network nodes. Let any AI walk goal route through the network (`game/managers/mapNetwork/graphSearch.ts` `findNodePath`) as waypoint hints so units follow roads. Needs a design pass: which AI opts in, how far off-network a goal can be, and determinism/caching. |
| One POI list per map segment | Each segment's POIs are written twice: named consts in the `MapSegments/*.ts` file, then a duplicated `MapSegmentPOI[]` (46 entries across 15 segments) in `storylines/WorldOfDarkness/registerSegments.ts`. Have each segment export its own `*_POIS: MapSegmentPOI[]` (and zones/network alongside) and make `registerSegments.ts` only wire them up. Also update the resync-terrain skill's Step 6 to match. |
| `TerrainGrid.get()` should return a distinct out-of-bounds result | Today `TerrainGrid.get(col,row)` (`terrain/TerrainGrid.ts:47`) returns `TerrainType.Rock` for out-of-bounds cells, so callers can't tell "real rock" from "off the map" — e.g. an area ability scanning a tile region near the edge counts void cells as rock. Introduce an explicit out-of-bounds sentinel (new `TerrainType.OutOfBounds` or a nullable return) that abilities can respond to, and update the ~12 `grid.get` callers plus pathfinding/passability so off-map still reads as impassable. Medium: touches the `TerrainType` enum, `TERRAIN_PROPERTIES`, `TerrainManager`, `Pathfinding`, and consumers. |

## Hard

| Todo | Notes |
|------|-------|
| Revisit unifying CastBehaviour and EventTriggeredBehaviour interfaces | The EnergyBlast migration introduces EventTriggeredBehaviour (a one-shot onEventTrigger(ctx)) alongside CastBehaviour (multi-tick lifecycle: onSetup/onTick/onInterrupt). A deeper design question is whether these should eventually be unified. Problems to solve first: (1) Lifecycle mismatch — CastBehaviour maintains per-cast state across ticks via behaviourPayload; EventTriggeredBehaviour is fire-and-forget with no persistent state. (2) Context mismatch — CastBehaviourSetupContext carries windowProgress, isFirstTick, behaviourPayload, castPayload; AbilityEventRuntimeContext carries projectile, hitUnit, eventType — fundamentally different shapes that a unified interface must reconcile (union type, common base, or overloaded entry points). (3) Control flow — CastBehaviours are clock-driven (timing intervals); EventTriggeredBehaviours are event-driven (game events) — a unified API must not muddle which drives which. |
