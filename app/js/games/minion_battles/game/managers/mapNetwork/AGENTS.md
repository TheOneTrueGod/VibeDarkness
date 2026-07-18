# Map Network Subsystem

Shared graph infrastructure — a mission's node/edge network plus the `Structure` tag convention
— consumed by all three "network" AI trees (`networkHunt`, `lanterniteNetwork`,
`swarmlingNetwork`). Domain-specific nest/swarm behavior built on top of this graph lives in
`game/lanternite/AGENTS.md`; this doc covers the graph/population/structure mechanics themselves.

## Files

| File | Owns |
|------|------|
| `MapNetworkManager.ts` | The node/edge graph, node membership (`unitIds`), and the read-only query API (`getNode`, `getNeighborIds`, `getNeighborNodes`, `findNodeContainingPosition`, `findNodeForUnit`, `getUnitIdsInNode`, `getUnitCountsByCharacterId`, `getOwnerCharacterId`, `getAllNodeIds`) |
| `graphSearch.ts` | Graph-search primitives: `resolveNearestNodeId`, `findNodePath` (BFS shortest path), `findNearestNodeByHops` (BFS-first-match) |
| `types.ts` | `NetworkNode`, `NetworkEdge`, `ResolvedMapNetwork`, `SerializedMapNetwork` |

## Lifecycle

Node/edge **structure** and node **membership** have different lifecycles:

- **Structure** (`loadFromSegments`): rebuilt from `getMissionSegmentNetwork` at mission init
  (`BaseMissionDef.initializeGameState`) and on checkpoint/resync
  (`GameEngine.fromJSON`, gated on `opts.segmentIds`). Never serialized — `toJSON`/`restoreFromJSON`
  are deliberate no-ops, since the graph is always cheaply rebuildable from segment data and there's
  nothing authoritative to persist.
- **Membership** (`unitIds` per node) used to be a full clear-and-rescan of every participating unit
  on every simulation tick. It is now:
  1. **Seeded once** via `buildInitialMembership(units)` — called exactly twice per battle: once
     at the end of `BaseMissionDef.initializeGameState` (after all mission-init units exist), and
     once after resync's `loadFromSegments` call in `GameEngine.fromJSON` (after
     `unitManager.restoreFromJSON` has populated `engine.units`).
  2. **Kept current incrementally** via `updateUnitNode(unit)` — called once per unit per
     simulation tick, right after that unit's movement is fully resolved
     (`UnitManager.gameTick`'s Phase 2 loop, immediately after `unit.tickMovement`). It diffs the
     unit's currently-resolved node against a cached last-known node and only touches the two
     affected nodes' `unitIds` arrays when membership actually changed — no full rebuild.
  3. **Cleaned up on death** via `unregisterUnit(unitId)` — called both from `updateUnitNode`'s
     dead-unit branch and directly from a `unit_died` EventBus listener in
     `GameEngine.registerCoreEventListeners` (belt-and-suspenders, since a dead unit's position
     typically never changes again after death, so the per-tick diff might not re-fire).

  **Accepted gap:** a brand-new participating unit (a freshly spawned nest or swarmling) isn't
  registered until the *next* tick's movement loop touches it — a one-tick lag. This mirrors the
  staleness the old per-tick-rebuild model already had (membership always reflected the *previous*
  tick's positions), so it's a preserved characteristic, not a regression. It was not worth
  threading a `MapNetworkManager` reference through `spawnUnit()`'s narrower call sites
  (`processLanterniteNests`/`processSwarmNests`'s `SpawnUnitContext`) to close it.

## Participation

A unit is only a membership candidate if its unit def opts in:
`UnitDefEntry.participatesInMapNetwork` → `getUnitParticipatesInMapNetwork(characterId)`
(`game/units/unit_defs/unitDef.ts`). Today: `swarmling`, `lanternite`, `lanternite_nest`,
`swarm_nest`. A non-participating unit (e.g. `thornling_nest`, `slime`) is invisible to the
network regardless of position — the same "managed purely because a unit-def field says so"
convention `CellOccupancyManager` uses.

## The `Structure` tag

`UnitTag.Structure` (`game/units/unitTag.ts`) is the generic "this is a structure, not a mobile
unit" signal for AI trees. It's set **statically per characterId**, not per spawn instance:
`UnitDefEntry.tags` → `getUnitStaticTags(characterId)`, merged onto `unit.tags` in
`createUnitFromSpawnConfig` (`game/units/index.ts`) alongside the existing per-spawn
`SpawnDefinition.unitTags`.

- `lanternite_nest` and `swarm_nest` carry `Structure`.
- `thornling_nest` deliberately does **not** — a scoped decision, not an oversight. It used to be
  swept up by `networkHunt`'s old `speed === 0` proxy; now it's simply not a valid `networkHunt`
  target.

Any AI tree needing "find enemy structures" should call `findEnemyStructures(unit, units)`
(`game/units/unitAI/utils.ts`) rather than re-deriving a proxy — `nh_travel.ts` is the only current
consumer.

## Graph search primitives (`graphSearch.ts`)

| Function | Used by |
|---|---|
| `resolveNearestNodeId(x, y, mapNetwork)` — node containing the position, or nearest-by-distance fallback | `nh_travel.ts` (every travel tick), `snet_seek.ts` (spawn-position bootstrap) |
| `findNodePath(mapNetwork, fromId, toId)` — BFS shortest path by edge count | `nh_travel.ts` (hop-by-hop travel toward the nearest enemy structure) |
| `findNearestNodeByHops(mapNetwork, fromId, predicate)` — BFS, returns first match in non-decreasing hop order | `swarmNestTick.ts`'s `findUnclaimedNetworkNode` (bootstrap direction-picker) |

These live here rather than `unitAI/utils.ts` because both an AI tree (`nh_travel.ts`) and a
non-AI nest-tick module (`game/lanternite/swarmNestTick.ts`) need them.

## What each network tree does with the graph

The three trees deliberately use the graph differently — this is not an inconsistency to "fix":

- **`networkHunt`** (wave reinforcements: wolves, wave-spawned swarmlings) — no persistent
  targeting state. Every travel tick, recomputes the nearest enemy structure by graph-hop distance
  fresh and takes the next hop toward it. Switches to `nh_engage` on spotting any enemy.
- **`lanterniteNetwork`** (lanternite scouts) — a single fixed target assigned once
  (`findUnoccupiedConnectedNestPoi`, a *neighbor-of-home*-restricted search using
  `getOwnerCharacterId`), walked straight to. Unchanged by the population-gradient work below.
- **`swarmlingNetwork`** (nest-building swarmlings) — see `game/lanternite/AGENTS.md` for the
  full population-gradient / reassign-on-arrival design. This is the only tree with that state
  machine; it is exclusive to swarmlings by design.
