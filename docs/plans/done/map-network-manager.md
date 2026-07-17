# Generalize the lanternite/swarm "network" into a reusable MapNetworkManager

**Status (2026-07-16): Complete.** All 10 steps implemented and verified: the generic
`MapNetworkManager` (graph of nodes/edges, ownership/membership queries) is built, wired into
`GameState`/`EngineContext`/`GameEngine`/checkpoint serialization/`AIContext`, and lanternite is
fully migrated off `connects:<id>` POI tags onto real segment `network` data (including a
previously-missing `50_51_south_gate.ts` gap found and fixed during Step 10's final verification).
Full suite: 130 files, 1044 passed / 1 skipped, 0 failures; lint 0 errors/17 pre-existing warnings;
`tsc --noEmit` clean. Swarm migration is captured as a follow-up TODO in `docs/TODO.md`, not
implemented here. One item remains for a human: the Step 10 manual/browser checklist (launch Thorn
March and visually confirm nest/guard/scout/construction behavior) was not automated.

**Post-plan doc fix (2026-07-16):** `NetworkNodeDefSchema.radius`'s doc comment (`networkSchema.ts`)
incorrectly claimed the value was "in grid cells" like `MapSegmentPOI.radius`. In reality,
`getMissionSegmentNetwork` never converts `radius` from grid cells to pixels the way it does for
`position` — it passes the authored number straight through into the pixel-space containment check
in `MapNetworkManager.findNodeContainingPosition`. No real segment currently sets a nonzero
`radius`, so this had no behavioral impact, but the doc was wrong about units. Fixed the doc
comments in `networkSchema.ts` and `segmentRegistry.ts` (`ResolvedNetworkNode`) to state that
`radius` must be authored in pixels, not grid cells — behavior unchanged, docs now match reality.

## Context

Minion Battles currently has two independently-implemented, near line-for-line duplicated
"network" systems: the lanternite nest network (`lanterniteNestTick.ts` + `lanterniteNetwork` AI
tree + `lanterniteNetworkUtils.ts`) and the swarm nest network (`swarmNestTick.ts` +
`swarmlingNetwork` AI tree). Both were touched repeatedly in a recent session (adding
shared-construction acceleration, fixing a duplicate-nest bug) and every change had to be made
twice. Node connectivity today is just ad-hoc `connects:<id>` string tags on `MapSegmentPOI`,
parsed fresh on every call — no cached graph, no ownership field, no reusable query surface.
Mission files also hand-compute segment-to-mission-global coordinate offsets manually (e.g.
`008_thorn_march.ts`'s `SEG_49_51_COL + LANTERN_NEST_FOCUS.col` arithmetic) because, unlike zones
(`getMissionSegmentZones`), POIs have no auto-offset helper.

The goal: build a single, generic, reusable **`MapNetworkManager`** — a graph of nodes/edges with
node ownership and per-node unit membership, exposed as AI hints — so future systems (and a later
swarm migration) get this for free instead of re-implementing it. This plan builds the generic
system and migrates **lanternite only** onto it. Swarm stays on its current implementation; a
TODO captures the follow-up.

Three parallel codebase investigations (lanternite/swarm/thornling internals, map-segment/mission
POI plumbing, AI-tree/manager conventions) plus direct verification of the highest-risk claims
against current code inform this plan. **Exact line numbers below are approximate** — a recent
session edited `lanterniteNestTick.ts` (shared-construction feature), shifting lines from what the
original exploration found. Workers must re-read each file fresh before editing, per the standard
worker convention.

### Confirmed design decisions (from user — do not re-litigate)

1. **Node data is a generic query surface, not baked-in behavior.** The manager exposes "who/how
   many units are in node X" and "what are node X's neighbors" as generic queries. It does NOT
   implement specific AI behaviors (e.g. "spread out based on neighbor occupancy" — that's
   explicit *future* work this infrastructure should enable, not build now).
2. **Track unit membership by actual unit id** (`unitIds: string[]` per node, mirroring
   `GroupManager`'s proven pattern). Derive `characterId`-keyed counts and ownership on demand —
   don't store them redundantly.
3. **Node authoring**: map segment files export a structured `NetworkNodeDef` list (id, position —
   segment-local grid point OR raw pixel point — radius, tags) plus a first-class `edges` list
   (node id pairs), replacing `connects:<id>` string tags. A mission def selects which segments'
   network data to include. The manager auto-resolves segment-local coords to mission-global
   coords when segments are stitched (closing the exact gap zones already have via
   `getMissionSegmentZones` but POIs don't).
4. **Scope**: generic system + lanternite migration only. Swarm migration is an explicit
   follow-up TODO, not part of this plan. Do not touch thornling. Do not build the "AI spreads out
   based on neighbor occupancy" feature — the manager just needs to make that queryable later.

### What already exists (read these first — do not recreate)

- **`GroupManager`** (`app/js/games/minion_battles/game/units/unitAI/groups/GroupManager.ts`) —
  the structural template: class on `GameState.groupManager`, `groupId`-keyed, plain
  `unitIds: string[]` membership (faction-agnostic), `tick(gameTick, context: AIContext)` called
  from `GameEngine.fixedUpdate` at `GameEngine.ts:1386`, immediately **before**
  `unitManager.gameTick()` (line 1387, which runs unit AI) — this is the "fresh before AI reads it
  same-tick" placement to mirror. Has `toJSON(gameTick)`/`fromJSON(data, gameTick)`.
- **`CellOccupancyManager`** (`app/js/games/minion_battles/game/managers/CellOccupancyManager.ts`)
  — the template for data-driven opt-in: a unit is "managed" purely because a unit-def field
  (`getUnitMaxPerTile(characterId)`) returns a value, never a hardcoded characterId check.
- **`getMissionSegmentZones`** (`app/js/games/minion_battles/terrain/segmentRegistry.ts:78-96`,
  confirmed verbatim) — the exact offset-resolution pattern to mirror for nodes:
  `originCol = (seg.gridCol - minCol) * seg.width`, `originRow = (seg.gridRow - minRow) * seg.height`,
  computed once across `segmentIds`, applied per-segment.
- **`EngineContext`** (`app/js/games/minion_battles/game/EngineContext.ts`) already exposes
  `mapPOIs: MapSegmentPOI[]` (line 133), `mapZones` (136), `cellOccupancyManager: CellOccupancyManager | null`
  (142), `worldModifierManager: WorldModifierManager` (145, non-nullable) — confirms the pattern
  for adding `mapNetworkManager`.
- **`AIContext`** (`app/js/games/minion_battles/game/units/unitAI/types.ts`) has an established
  "optional, not all engines provide this" convention (`mapPOIs?`, `ninjutsuManager?`) — follow it
  for the new `mapNetwork?` field. Built in `GameEngine.ts`'s `buildAIContext` (confirmed
  `mapPOIs: this.mapPOIs` wiring around line 1674).
- **`SpawnAiHookup`** union (`app/js/games/minion_battles/game/units/spawning/spawnDefinition.ts`)
  and its dispatch switch in `spawnUnit.ts` (`applyAiHookup`) — existing extension point for
  faction-specific spawn-time state; **this plan does not need to touch it** (see Step 7).
- **`MapSegmentPOI`** schema (`app/js/games/minion_battles/terrain/segmentSchema.ts`) —
  `{ id, label, col, row, type, radius?, tags? }`, `MapSegmentData` also has `zones` and
  `pointsOfInterest` (confirmed current shape — no `network` field yet).
- **`lanternite/AGENTS.md`** documents today's intentional design: the swarm side does NOT check
  occupancy before targeting a POI (contests resolve via combat, not an arbiter) — this asymmetry
  is why swarm is out of scope for migration in this plan (it needs its own design pass, not a
  mechanical port).

### Fixed-update ordering note

`groupManager.tick()` (line 1386) runs **before** unit AI (line 1387). But
`processLanterniteNests`/`processSwarmNests`/`processThornlingNests` run **much later** in
`fixedUpdate` (around lines 1438/1453/1461, well after unit AI). This means:
- `MapNetworkManager.tick()` (the position-based `unitIds` membership rebuild) should still be
  placed near `groupManager.tick()`, before unit AI — for **future** consumers that will read
  per-tick membership from AI trees.
- But **Step 7's actual lanternite migration does not depend on this ordering at all** — the only
  thing lanternite consumes is the *static* graph (`getNeighborIds`, built once via
  `loadFromSegments` at mission init, never changes per-tick). Lanternite's existing
  "occupied"/"targeted" checks are explicit id-field comparisons (`homeNestPoiId === poiId`), not
  position/radius-based membership — so the position-based `tick()` machinery is genuinely
  forward-looking infrastructure, not something Step 7 exercises in production code. This is
  intentional per the user's explicit ask to "allow for" that future state — nobody should be
  surprised `getUnitCountsByCharacterId`/`getOwnerCharacterId` aren't called by any Step 7
  production code path, only by the manager's own tests.

### Design rules that apply to every step below

- **Decision logic never moves into the manager.** Which role a lanternite gets, the
  scout/defender ratio, golden-angle stagger math, contested-site detection — none of that becomes
  manager logic. It stays exactly where it is today, computed by `lanterniteNestTick.ts`/AI tree
  code using data the manager exposes. The manager holds structural/query data only.
- **No `unit.lanterniteState` field changes in this plan.** `targetNestPoiId`/`homeNestPoiId`/
  `nestOwnerUnitId` stay as unit-local intent fields; the manager derives membership from unit
  position, it does not replace these fields or require `SpawnAiHookup`/serialization changes.
  This is the plan's central risk-reduction decision — see Step 7.
- **After each step, only unchecked → checked items change.** Add a one-line summary under each
  item describing what actually changed.

## Agent Instructions

This plan is executed by **`/jp-implement-plan`**. Read `.claude/skills/jp-implement-plan/SKILL.md`
for the full orchestrator/worker workflow — the invoking agent is the sole orchestrator, spawning
one worker per step **synchronously**, waiting for each to finish, then reporting completion to
the user. Each worker implements exactly one step, checks off its items with a one-line summary,
and stops without spawning the next agent.

Relevant project skills for workers to apply as needed: **`working-on-minion-battles`**,
**`game-engine`** (manager-of-managers pattern, `fixedUpdate` step order, checkpoint
serialization — Steps 3-4), **`game-object-def-pattern`** (Step 5), **`working-on-ai-controllers`**
(Step 6), **`map-segments`** (Steps 1-2, 8), **`scoped-testing`** (per-step test selection),
**`working-with-todos`** (Step 9), **`ability-tests`** (final step only).

## Step 1: `NetworkNodeDef`/`NetworkEdgeDef` schema

**Touches:** `app/js/games/minion_battles/terrain/segmentSchema.ts`, new
`app/js/games/minion_battles/terrain/networkSchema.ts`

- [x] In `networkSchema.ts`: `NetworkNodePositionSchema` — discriminated union of
      `{ kind: 'gridPoint'; col: number; row: number }` (segment-local grid coords) and
      `{ kind: 'pixelPoint'; x: number; y: number }` (segment-local pixel offset, for sub-cell
      placement). `NetworkNodeDefSchema`: `{ id: string; position: NetworkNodePositionSchema;
      radius?: number; tags?: string[] }` — `radius` in grid cells (matches `MapSegmentPOI.radius`'s
      convention; find and reuse whatever existing undefined-radius fallback constant is used
      elsewhere, e.g. `missionSpawnHelpers.ts`, rather than inventing a new default).
      `NetworkEdgeDefSchema = z.tuple([z.string(), z.string()])` (undirected pair of node ids).
      `MapSegmentNetworkSchema = z.object({ nodes: z.array(NetworkNodeDefSchema).default([]),
      edges: z.array(NetworkEdgeDefSchema).default([]) })`.
      Created `app/js/games/minion_battles/terrain/networkSchema.ts` with exactly this shape;
      `radius` mirrors `MapSegmentPOI.radius` verbatim (`z.number().nonnegative().optional()`, no
      baked-in default). No existing dedicated POI-radius fallback constant was found (searched
      `missionSpawnHelpers.ts`, `spawnUnit.ts`, `lanternite/*`) — the closest precedent is
      `spawnUnit.ts`'s inline `placement.radius ?? 0`; called out in a doc comment for Step 2's
      resolver to reuse rather than inventing a new default there.
- [x] In `segmentSchema.ts`: add `network: MapSegmentNetworkSchema.optional()` to
      `MapSegmentDataSchema`, alongside `zones`/`pointsOfInterest`.
      Added the import and field; `MapSegmentData`'s inferred type now includes an optional
      `network` property.
- [x] **Do not extend `MapSegmentPOI`** — keep `NetworkNodeDef` a sibling type. `MapSegmentPOI` is
      consumed by unrelated systems (`closestEnemySpawnPoint` spawn behaviour,
      `BattleSession.ts:515`'s blanket POI auto-collection) that would otherwise need to filter out
      network-only nodes.
      Confirmed: `MapSegmentPOISchema` untouched; `NetworkNodeDefSchema` lives entirely in the new
      sibling file with no shared base type.

**Verify:** `npm run lint`, `npx tsc --noEmit`. Pure type addition, no runtime behavior yet — no
test run needed.

## Step 2: `getMissionSegmentNetwork` resolution helper

**Touches:** `app/js/games/minion_battles/terrain/segmentRegistry.ts`

- [x] Add `getMissionSegmentNetwork(segmentIds: string[]): { nodes: ResolvedNetworkNode[]; edges:
      NetworkEdgeDef[] }` mirroring `getMissionSegmentZones` (`segmentRegistry.ts:78-96`) exactly:
      same `minCol`/`minRow`/`originCol`/`originRow` computation, same skip-unregistered-segments
      behavior. `ResolvedNetworkNode = { id: string; x: number; y: number; radius: number; tags:
      string[]; segmentId: string }` — already-resolved mission-global **pixel** coords (so
      consumers never need a `terrainGrid.gridToWorld` conversion step). `gridPoint` positions
      resolve via `(originCol + col) * CELL_SIZE + CELL_SIZE/2`; `pixelPoint` positions resolve via
      `originCol * CELL_SIZE + x`.
      Added `ResolvedNetworkNode` interface and `getMissionSegmentNetwork` to
      `segmentRegistry.ts`, plus a private `resolveNetworkNodePosition` helper implementing the
      exact `gridPoint`/`pixelPoint` formulas above (using `CELL_SIZE` imported from
      `TerrainGrid.ts`). Segments with no `network` field are simply skipped (empty contribution).
- [x] Edges: only include an edge if both endpoint node ids exist in the collected node set;
      `console.warn` and drop otherwise (matches `parseAndRegisterSegment`'s warn-on-invalid
      pattern at `segmentRegistry.ts:29-31`).
      Implemented via a `Set` of collected node ids and an `.filter()` over all raw edges
      collected across segments; unmatched edges are dropped with a `console.warn` naming the
      unknown id pair.
- [x] Add `terrain/segmentRegistry.networkNodes.test.ts` — register two fake segments with
      `network.nodes`/`network.edges` (one `gridPoint`, one `pixelPoint` node), call
      `getMissionSegmentNetwork`, assert resolved world coords match hand-computed offsets and a
      cross-segment edge resolves correctly.
      Added the test file: two fake segments (`gridCol`/`gridRow` offsets), one `gridPoint` node
      and one `pixelPoint` node, a cross-segment edge, plus cases for a dropped edge with an
      unknown id (asserting `console.warn` is called) and empty/unregistered `segmentIds` input.

**Verify:** `npm run lint`, `npx tsc --noEmit`, then
`npx vitest run app/js/games/minion_battles/terrain/segmentRegistry.networkNodes.test.ts`.

## Step 3: `MapNetworkManager` class

**Touches:** new `app/js/games/minion_battles/game/managers/mapNetwork/MapNetworkManager.ts`,
`app/js/games/minion_battles/game/managers/mapNetwork/types.ts`

- [x] `NetworkNode` runtime shape: `{ id, x, y, radius, tags: readonly string[], unitIds: string[] }`.
      `NetworkEdge = readonly [string, string]`. Fields: `private nodes: Map<string, NetworkNode>`,
      `private edges: NetworkEdge[]`, `private adjacency: Map<string, Set<string>>` (built once per
      `loadFromSegments` call, not per-query).
      Added `app/js/games/minion_battles/game/managers/mapNetwork/types.ts` with `NetworkNode`,
      `NetworkEdge`, `ResolvedMapNetwork` (the `getMissionSegmentNetwork` return shape,
      re-exported for `loadFromSegments`'s param type), and `SerializedMapNetwork` (empty
      `Record<string, never>`, documented as deliberate — see below). `MapNetworkManager` class
      created with exactly the three private fields listed.
- [x] `loadFromSegments(resolved): void` — clears and rebuilds nodes/edges/adjacency. Idempotent;
      safe with empty input (no-op network for missions with no nodes).
      Implemented: clears all three fields, rebuilds nodes/adjacency from `resolved.nodes`, then
      adds edges only when both endpoints exist in the just-built node map (defensive re-check
      even though `getMissionSegmentNetwork` already filters). Verified idempotent and
      empty-safe via tests.
- [x] Query API (read-only, generic): `getNode(id)`, `getNeighborIds(id): string[]`,
      `getNeighborNodes(id): NetworkNode[]`, `findNodeContainingPosition(x, y): NetworkNode | undefined`
      (closest-center-wins tie-break when radii overlap — document this explicitly, add a test case
      for it), `findNodeForUnit(unitId): NetworkNode | undefined`, `getUnitIdsInNode(id): readonly string[]`,
      `getUnitCountsByCharacterId(id, units: readonly Unit[]): Map<string, number>` (derived view:
      resolve `unitIds` → look up in passed `units` → tally by `characterId`; takes `units` as a
      param rather than holding a reference, matching `GroupManager.tick`'s pattern),
      `getOwnerCharacterId(id, units): string | undefined` (derived — return `undefined` on a tie
      between 2+ character ids present, since "contested" is meaningfully different from "owned"),
      `getAllNodeIds(): string[]`.
      All methods implemented exactly as specified. `findNodeContainingPosition` picks the node
      with smallest center-to-point distance among those whose radius contains the point (doc
      comment explains the tie-break); `getOwnerCharacterId` returns `undefined` whenever
      `getUnitCountsByCharacterId` doesn't resolve to exactly one distinct `characterId`.
- [x] `tick(units: readonly Unit[]): void` — full rebuild each tick: for each unit whose def opts
      in (Step 5), find its containing node via `findNodeContainingPosition` and rebuild that
      node's `unitIds` from scratch. Full-rebuild-per-tick (not incremental diffing) matches the
      `CellOccupancyManager` precedent and avoids the stale-entry bug class that
      `nestSpawnState.spawnedIds`'s manual pruning is prone to.
      Implemented: clears every node's `unitIds`, then for each unit with `unit.active &&
      unit.isAlive()` looks up its containing node via `findNodeContainingPosition` and pushes its
      id. The Step-5 unit-def opt-in filter does not exist yet, so today every active/alive unit
      is a candidate; doc comment on `tick()` explicitly flags this as the Step-5 handoff point.
- [x] `toJSON()`/`restoreFromJSON(data)`: **ownership and membership are fully derived, not
      serialized** — node positions/edges are always freshly rebuilt by `loadFromSegments` during
      `initializeGameState` (never from a checkpoint), and `unitIds` repopulates itself on the next
      `tick()` call after any restore. `toJSON`/`restoreFromJSON` exist for interface consistency
      and to leave room for future authoritative state, but are no-ops today — **add a code comment
      explaining this explicitly** so it doesn't read as "forgot to serialize" (the cautionary
      counter-example: `LanterniteRespawnManager` has no serialization at all and silently drops
      its respawn queue on every checkpoint reload — don't repeat that by omission, document the
      no-op deliberately).
      `toJSON()` returns `{}` (typed `SerializedMapNetwork = Record<string, never>`);
      `restoreFromJSON()` is a no-op. Both carry a doc comment explaining the deliberate-no-op
      rationale and contrasting it with `LanterniteRespawnManager`'s silent respawn-queue loss.
- [x] Add `game/managers/mapNetwork/MapNetworkManager.test.ts` — `loadFromSegments` populates
      correctly (including disconnected-graph and no-dangling-edge cases); `tick()` correctly
      assigns/reassigns/removes membership as units move/die; `getUnitCountsByCharacterId` tallies
      correctly; `getOwnerCharacterId` returns `undefined` for empty and tied nodes, correct id for
      an uncontested node; `findNodeContainingPosition`'s overlap tie-break.
      Added the test file with 13 cases covering exactly this list (constructing `Unit` instances
      directly via `new Unit({...})`, no `GameEngine` needed). All pass.

**Verify:** `npm run lint`, `npx tsc --noEmit`, then
`npx vitest run app/js/games/minion_battles/game/managers/mapNetwork/MapNetworkManager.test.ts`.

## Step 4: Wire into `GameState`, `EngineContext`, `GameEngine`, `BaseMissionDef`, serialization

**Touches:** `app/js/games/minion_battles/game/GameState.ts`,
`app/js/games/minion_battles/game/EngineContext.ts`,
`app/js/games/minion_battles/game/GameEngine.ts`,
`app/js/games/minion_battles/storylines/BaseMissionDef.ts`,
`app/js/games/minion_battles/game/types.ts`

- [x] `GameState.ts`: add `readonly mapNetworkManager: MapNetworkManager;`, constructed alongside
      `this.groupManager = new GroupManager();` (`GameState.ts:110`).
      Added the import, `readonly mapNetworkManager: MapNetworkManager;` field, and
      `this.mapNetworkManager = new MapNetworkManager();` in the constructor right after
      `worldModifierManager`.
- [x] `EngineContext.ts`: add `mapNetworkManager: MapNetworkManager;` (non-nullable — always
      present, harmlessly empty if unused, matching `mapPOIs`/`mapZones`'s always-array convention
      rather than `cellOccupancyManager`'s nullable one).
      Added `readonly mapNetworkManager: MapNetworkManager;` to the interface with a doc comment
      explaining the always-present convention.
- [x] `GameEngine.ts`: add a `mapNetworkManager` getter delegating to `this.state.mapNetworkManager`
      (read-only; mutation goes through `loadFromSegments`/`tick`, no setter needed).
      Added a read-only getter mirroring `worldModifierManager`'s getter exactly (no setter).
- [x] `BaseMissionDef.initializeGameState` — right after `engine.registerMapZones(params.terrainSegmentZones ?? [])`
      (`BaseMissionDef.ts:~193-194`), add:
      `engine.state.mapNetworkManager.loadFromSegments(getMissionSegmentNetwork(this.segmentIds))`.
      Call this directly using `this.segmentIds` (already on every `BaseMissionDef`) rather than
      threading a new `terrainSegmentNetwork` param through `BattleSession.ts` the way POIs/zones
      are pre-computed there — this is a deliberate simplification since `mapNetworkManager` is new
      with no existing multi-call-site convention to match; note it as intentional in a code
      comment, not an oversight.
      Added the import and the call, with an inline comment documenting the deliberate
      simplification exactly as specified.
- [x] `GameEngine.fixedUpdate()` (`GameEngine.ts:~1382-1392`): add
      `this.state.mapNetworkManager.tick(this.units);` immediately before
      `this.state.groupManager.tick(...)` (line 1386) — see "Fixed-update ordering note" above.
      Added the call directly above `groupManager.tick(...)`, inside the `!this.storyPauseActive`
      block, using the already-computed `this.units` accessor (no new context needed).
- [x] `SerializedGameState` (`game/types.ts`): add optional `mapNetwork?: SerializedMapNetwork`
      field (mirrors `firedEventIndices`/`objectives`/`mapPOIs` optionality for checkpoint
      back-compat).
      Added `mapNetwork?: import('./managers/mapNetwork/types').SerializedMapNetwork;` next to
      `mapZones`, with a doc comment noting it's deliberately always-empty today (rebuilt from
      segment data on restore, not from this field).
- [x] `GameEngine.toJSON()`/`fromJSON()`: add `mapNetwork: this.state.mapNetworkManager.toJSON()`
      to the serialized object; on restore, verify whether `fromJSON` can run without a prior
      `initializeGameState` call in any restore path (if so, `restoreFromJSON` needs to
      independently call `loadFromSegments` — check using the `missionDef`/`segmentIds`
      `GameEngine.fromJSON` already has access to).
      Confirmed: `BattleSession.loadFromSnapshot` and `restoreFromInMemorySnapshot` both call
      `GameEngine.fromJSON` directly without re-running `mission.initializeGameState` (mapPOIs/
      mapZones are restored straight from serialized data in that path, with no equivalent for the
      network graph since it's deliberately unserialized). Added `segmentIds?: string[]` to
      `GameEngineFromJSONOpts` (`game/types.ts`); `fromJSON` now calls
      `mapNetworkManager.restoreFromJSON(data.mapNetwork)` (no-op) followed by
      `mapNetworkManager.loadFromSegments(getMissionSegmentNetwork(opts.segmentIds))` when
      `opts.segmentIds` is present. Updated both `BattleSession.ts` call sites
      (`loadFromSnapshot`, `restoreFromInMemorySnapshot`) to pass `segmentIds: mission.segmentIds`
      — both already have `mission` in scope. Top-level `toJSON()` now includes
      `mapNetwork: this.state.mapNetworkManager.toJSON()` alongside `mapPOIs`/`mapZones`.

**Verify:** `npm run lint`, `npx tsc --noEmit` (interface-crossing change), then
`npx vitest related app/js/games/minion_battles/game/GameEngine.ts --run` (checkpoint round-trip
coverage — must still pass since `mapNetwork` is additive/optional).

## Step 5: Unit opt-in mechanism

**Touches:** `app/js/games/minion_battles/game/units/unit_defs/unitDef.ts`,
`app/js/games/minion_battles/game/managers/mapNetwork/MapNetworkManager.ts`,
`app/js/games/minion_battles/game/managers/mapNetwork/MapNetworkManager.test.ts`

- [x] Add a unit-def field/accessor (e.g. `getUnitParticipatesInMapNetwork(characterId): boolean`,
      mirroring `getUnitMaxPerTile`'s pattern exactly) returning `true` for `lanternite` and
      `lanternite_nest` only in this plan (swarm stays opted out until its own migration).
      Added `participatesInMapNetwork?: boolean` to `UnitDefEntry` in `unitDef.ts`, set `true` on
      the `lanternite` and `lanternite_nest` entries only, and added
      `getUnitParticipatesInMapNetwork(characterId): boolean` (defaults to `false`) right after
      `getUnitMaxPerTile`, matching its exact shape. Confirmed via `CellOccupancyManager.ts` that
      `maxPerTile`-style accessors are called directly inside consuming managers, not via a `Unit`
      getter — no `Unit.ts` changes needed.
- [x] `MapNetworkManager.tick(units)` filters through this check before doing any
      radius-containment work — non-participating units are invisible to the network, exactly as
      unmanaged units are invisible to `CellOccupancyManager`.
      Added an early-`continue` in `tick()` (after the `active`/`isAlive` checks) calling
      `getUnitParticipatesInMapNetwork(unit.characterId)`; updated the method's doc comment
      accordingly.
- [x] Extend `MapNetworkManager.test.ts` with an explicit "unit whose def doesn't opt in never
      appears in any node's `unitIds`" case.
      Added a test using a `slime` unit (no `participatesInMapNetwork` flag) positioned inside node
      `a`'s radius, asserting it's absent from `getUnitIdsInNode('a')` and `findNodeForUnit`.

**Verify:** `npm run lint`, `npx tsc --noEmit`, then
`npx vitest run app/js/games/minion_battles/game/managers/mapNetwork/MapNetworkManager.test.ts`.

## Step 6: `AIContext` plumbing

**Touches:** `app/js/games/minion_battles/game/units/unitAI/types.ts`,
`app/js/games/minion_battles/game/GameEngine.ts` (`buildAIContext`)

- [x] Add `mapNetwork?: Pick<MapNetworkManager, 'getNode' | 'getNeighborIds' | 'getNeighborNodes' |
      'findNodeContainingPosition' | 'findNodeForUnit' | 'getUnitIdsInNode' |
      'getUnitCountsByCharacterId' | 'getOwnerCharacterId' | 'getAllNodeIds'>;` to `AIContext`,
      alongside `mapPOIs?`/`ninjutsuManager?`. The `Pick<...>` restricts AI trees to the read-only
      query surface — they cannot call `tick()`/`loadFromSegments()` through this type, enforcing
      the "generic query surface, not behavior" rule at the type level.
      Added the `mapNetwork?` field to `AIContext` in `types.ts` with the exact `Pick<...>` shape,
      plus a type-only import of `MapNetworkManager`.
- [x] `buildAIContext()`: add `mapNetwork: this.state.mapNetworkManager,` — structurally satisfies
      the `Pick<...>` type with zero extra code.
      Added `mapNetwork: this.state.mapNetworkManager,` to `GameEngine.ts`'s `buildAIContext()`
      return object, right after `ninjutsuManager`.
- [x] Check any minimal/bare `AIContext` built directly in test scaffolding (e.g.
      `testing/harness/buildTinyBattleEngine.ts`) compiles fine with the field omitted (it's
      optional) — no changes should be needed there.
      Confirmed: no bare `AIContext` object is built in `buildTinyBattleEngine.ts`. The only
      hand-built literal is `DefaultAITree.test.ts`'s `createMockContext`, which already omits
      `mapPOIs`/`ninjutsuManager` and now also omits `mapNetwork` — compiles fine since all three
      are optional; no changes needed.

**Verify:** `npm run lint`, `npx tsc --noEmit`. No behavior change yet — no test run needed.

## Step 7: Lanternite migration

**Touches:** `app/js/games/minion_battles/game/lanternite/lanterniteNetworkUtils.ts`,
`app/js/games/minion_battles/game/lanternite/lanterniteNestTick.ts`

**Confirmed by direct inspection**: `lnet_scout_travel.ts`, `lnet_assign_role.ts`, `lnet_guard.ts`,
and `lnet_chase.ts` do **not** import or call anything from `lanterniteNetworkUtils.ts` — the only
call site for `findUnoccupiedConnectedNestPoi` is inside `lanterniteNestTick.ts`'s role-assignment
block. So **no AI-tree files need changes** in this step — only `lanterniteNetworkUtils.ts` and
`lanterniteNestTick.ts`'s call site change.

- [x] **Rewrite `lanterniteNetworkUtils.ts`**: delete `getConnectedNestPoiIds` (tag parsing) —
      replaced by `mapNetwork.getNeighborIds(nodeId)`. Rewrite
      `findUnoccupiedConnectedNestPoi(nestPoiId, mapNetwork, units)` (new signature, taking the
      manager instead of `allPois`): for each neighbor id, check
      `mapNetwork.getOwnerCharacterId(neighborId, units) == null` AND no live unit has
      `lanterniteState.targetNestPoiId === neighborId` (second check stays unit-state-based —
      "targeting" is a unit-local intent, not a node occupancy fact). Return the neighbor's
      resolved world position directly from `mapNetwork.getNode(id)` (`x`/`y`) — the manager
      already stores mission-global px, so callers no longer need
      `terrainGrid.gridToWorld(poi.col, poi.row)`. `countAliveChildrenByRole` **stays unchanged and
      unit-local** — role bookkeeping is decision logic, not graph data.
      Deleted `getConnectedNestPoiIds` and the `MapSegmentPOI`/`LANTERNITE_NEST_CHARACTER_ID`
      imports it needed. `findUnoccupiedConnectedNestPoi` now takes
      `mapNetwork: Pick<MapNetworkManager, 'getNeighborIds' | 'getOwnerCharacterId' | 'getNode'>`
      and returns `NetworkNode | null` (the manager's own node object, so callers get `x`/`y`
      directly). `countAliveChildrenByRole` untouched.
- [x] **`lanterniteNestTick.ts`**: `processLanterniteNests` gains a `mapNetwork` param (or the
      `Pick<...>` query-surface type), threaded from its `GameEngine.fixedUpdate` call site. The
      role-decision block (scout/defender split, `countAliveChildrenByRole`, golden-angle
      `constructionAngle`, `attackReadyAtGameTime` stagger) keeps its exact structure — only the
      `findUnoccupiedConnectedNestPoi` call's signature and the now-unnecessary
      `terrainGrid.gridToWorld` conversion change. The existing "alreadyOccupied"
      dedup-on-completion check: **leave as-is**, do not migrate it to `getOwnerCharacterId` — it
      checks a specific condition (`homeNestPoiId === targetNestPoiId` on a live `lanternite_nest`)
      the generic method would need extra plumbing to replicate exactly; not worth the churn. Note
      this explicitly in a code comment as a deliberate "duplicated-but-fine" call. Shared-
      construction acceleration block, spawn burst loop, `SpawnUnitContext` boilerplate,
      construction particle VFX emitters, invulnerability-tag propagation — **all stay
      byte-for-byte unchanged**.
      Added `mapNetwork?: MapNetworkQuery` (local `Pick<MapNetworkManager, 'getNeighborIds' |
      'getOwnerCharacterId' | 'getNode'>` alias) to `processLanterniteNests`'s params, optional to
      match `mapPOIs`'s convention. `targetPoi: MapSegmentPOI | null` → `targetNode: NetworkNode |
      null`; `patrolFarWorld`/`targetNestPoiId` now read straight off `targetNode.x/y/id` — no
      `terrainGrid.gridToWorld` call. Since that was `terrainGrid`'s only use in this file, removed
      the now-fully-dead `terrainGrid` param, `TerrainGridLike` interface, and `CELL_SIZE` import
      (`GameEngine.ts`'s call site — not in this step's Touches list but required by "threaded from
      its `GameEngine.fixedUpdate` call site" — updated to pass `mapNetwork:
      this.state.mapNetworkManager` instead of `terrainGrid: this.terrainManager?.grid ?? null`;
      `processSwarmNests`'s separate `terrainGrid` usage a few lines below is untouched). Added the
      explicit "deliberate duplicated-but-fine" doc comment above the `alreadyOccupied` check.
- [x] **`unit.lanterniteState` fields: no changes.** `role`, `constructionCompleteAtGameTime`,
      `constructionAngle`, `attackReadyAtGameTime`, `nestConfig`, `nestSpawnState`,
      `constructionEmitterStarted`, `patrolFarWorld`/`patrolLeg`, `targetNestPoiId`/
      `homeNestPoiId`/`nestOwnerUnitId` all stay exactly as they are today — see "Design rules"
      above. No `SpawnAiHookup` changes, no serialization format changes.
      Confirmed: no changes to `unitDef.ts`'s `LanterniteState` shape, `SpawnAiHookup`, or any
      serialization path in this step.

**Verify:** `npm run lint` (clean, 0 errors/17 pre-existing warnings), `npx tsc --noEmit` (clean),
then
`npx vitest related app/js/games/minion_battles/game/lanternite/lanterniteNestTick.ts app/js/games/minion_battles/game/lanternite/lanterniteNetworkUtils.ts --run`
— 338 passed, **2 failed**: `SimulationRunner.test.ts`'s `passes lanternite nest build scenario`
and `passes lanternite nest dual-spawn scenario`. **Expected, not a regression from this step**:
`vitest related` transitively pulls in `SimulationRunner.test.ts` even though the plan says "do not
run the AbilityTest scenarios here" — and per this same plan's Step 8 preamble, the real segments
(`49_51_west_glade`, `49_52_thorn_path`, `48_52_thorn_path_2`) still only have old-style
`connects:<id>` POI tags (confirmed via grep — zero `network:` fields exist anywhere in
`WorldOfDarkness` yet), which `lanterniteNetworkUtils.ts` no longer reads. Until Step 8 adds real
`network.nodes`/`edges` data, `mapNetwork.getNeighborIds(...)` returns `[]` for every real nest
node, so scouts never get a build target — exactly the "silently empty graph" risk Step 8's
preamble calls out. **Step 8 must land before these two scenarios pass again**; Step 10's full
lanternite AbilityTest run is the point where this gets revalidated. Do not treat this as something
to fix within Step 7's scope (`registerSegments.ts`/segment files are Step 8's Touches, not Step
7's).

## Step 8: Migrate `registerSegments.ts`'s `connects:` tags to `network.nodes`/`network.edges`

**Touches:** `app/js/games/minion_battles/storylines/WorldOfDarkness/registerSegments.ts`,
`app/js/games/minion_battles/storylines/WorldOfDarkness/MapSegments/49_51_west_glade.ts`,
`app/js/games/minion_battles/storylines/WorldOfDarkness/MapSegments/49_52_thorn_path.ts`,
`app/js/games/minion_battles/storylines/WorldOfDarkness/MapSegments/48_52_thorn_path_2.ts`

**Required, not optional cleanup** — Step 7 deletes `connects:` tag parsing entirely. Without
equivalent `network` data on these segments, the graph is silently empty (no error,
`mapNetwork.getNeighborIds('nest_west')` just returns `[]`), which is a real risk since it degrades
gracefully into subtly wrong behavior rather than a crash.

- [x] Add `nodes: [{ id, position: { kind: 'gridPoint', col, row }, radius, tags }, ...]` and
      `edges: [[idA, idB], ...]` to the `MapSegmentData` for these three segments (referenced by
      `008_thorn_march.ts`/`007_ember_threshold.ts`), replacing the `connects:<id>` tags currently
      on their `pointsOfInterest` entries in `registerSegments.ts`.
      Each segment file now exports a `MapSegmentNetwork` constant (`WEST_GLADE_NETWORK`,
      `THORN_PATH_NETWORK`, `THORN_PATH_2_NETWORK`) built from the segment's existing raw
      `{col,row}` point (`LANTERN_NEST_FOCUS`/`NEST_POINT_1`/`NEST`, left untouched so
      `008_thorn_march.ts`'s own hand-rolled world-position arithmetic still compiles unchanged).
      Node ids are `nest_49_51`/`nest_49_52`/`nest_48_52` — the exact ids `008_thorn_march.ts`
      already hardcodes for `nestPoiId`/`targetNestPoiId` — verified by hand that
      `getMissionSegmentNetwork`'s origin math reproduces the identical mission-global pixel
      coordinates both `008_thorn_march.ts` and `007_ember_threshold.ts` already compute
      independently for the shared `nest_49_51` node, so neither mission file needed changes.
      Edges: `nest_49_51<->nest_49_52` (declared on the west-glade segment) and
      `nest_49_52<->nest_48_52` (declared on the 49_52 segment). `registerSegments.ts`'s three
      `registerSegment(...)` call sites now spread in `network: <SEGMENT>_NETWORK`. Removed the
      now-dead `tags: ['connects:nest_south']` from `nest_west`'s POI entry (the only `connects:`
      tag among these three segments' own `registerSegments.ts` POIs); left
      `50_51_south_gate`'s `connects:nest_west` tag untouched since that segment is out of this
      step's scope (see follow-up note below).
- [x] Convert the ad hoc `LANTERN_NEST_FOCUS`-style raw `{col,row} as const` exports (and
      `49_52_thorn_path.ts`'s `NEST_POINT_1`, `48_52_thorn_path_2.ts`'s `NEST`) into proper
      `NetworkNodeDef` entries where they represent nest sites — this replaces
      `008_thorn_march.ts:60-117`'s hand-rolled `SEG_X_COL + LOCAL_POINT.col` arithmetic for the
      *network graph* specifically. **Do not** rewrite `008_thorn_march.ts`'s spawn logic — it can
      keep independently computing world positions for pre-placed unit spawning; only the
      network-graph aspect needs the new schema.
      Done via the new `*_NETWORK` exports above, which wrap the existing raw point constants in a
      `NetworkNodeDef` (`position: { kind: 'gridPoint', col: X.col, row: X.row }`) rather than
      renaming/reshaping the raw exports themselves — so `008_thorn_march.ts` (not in this step's
      Touches list) needed zero edits, exactly per the "do not rewrite" instruction.
- [x] Add a tripwire test (new or added to `segmentRegistry.networkNodes.test.ts` from Step 2)
      asserting `getMissionSegmentNetwork(['49_51_west_glade', '49_52_thorn_path', '48_52_thorn_path_2'])`
      (or the equivalent real segment ids) produces a non-empty edge list connecting the real nest
      node ids — independent of the mission integration test's pass/fail, so a silently-empty graph
      fails loudly.
      Added a new `describe` block to `segmentRegistry.networkNodes.test.ts` that calls
      `registerWorldOfDarknessSegments()` then asserts `getMissionSegmentNetwork([...])` for the
      three real segment ids returns exactly `['nest_48_52', 'nest_49_51', 'nest_49_52']` and both
      expected edges. All 5 tests in the file pass (2 pre-existing + 3 new: `beforeEach` +
      1 `it`, plus the file's existing 4 `it`s — 5 total).

**Additional fix beyond this step's listed Touches** (required for the two AbilityTest scenarios
Step 7 flagged as currently failing): `testing/scenarios/general/lanternites.ts`'s
`lanternite_nest_build`/`lanternite_nest_dual_spawn` scenarios build their engine via
`buildTinyBattleEngine` (no mission, no segments) and previously registered network connectivity
via `engine.registerMapPOIs([...{tags:['connects:...']}])`. That mechanism doesn't reach real
segments at all — it's a fully separate, self-contained POI list — so real-segment network data
(this step's main fix) could never have made it pass; Step 7's diagnosis attributing the failure to
"the real segments have no network data yet" was directionally right about the underlying cause
(Step 7 deleted `connects:` tag parsing) but didn't account for this harness bypassing segments
entirely. Fixed by having both scenarios call
`engine.mapNetworkManager.loadFromSegments({ nodes: [...], edges: [[...]] })` directly (mirroring
what `BaseMissionDef.initializeGameState` does via `getMissionSegmentNetwork` in the real game),
and dropping the now-inert `connects:` tags from their `registerMapPOIs` calls (POIs stay
registered for cosmetic/display purposes only). Verified via
`npx vitest run app/js/games/minion_battles/testing/runner/SimulationRunner.test.ts -t "lanternite"`
— all 6 lanternite scenarios (build, dual-spawn, shared-construction, defender-attack,
nest-thorn-spread) now pass.

**Known follow-up gap (not fixed in this step, flagged for Step 10):**
`007_ember_threshold.ts` also needs its `50_51_south_gate` segment's nest (`nest_50_51`) to reach
`nest_49_51` via the network graph for its second hop (its first scout's target,
`nest_50_51`, is still hardcoded — only the *expansion beyond* `nest_50_51` uses
`findUnoccupiedConnectedNestPoi`). `50_51_south_gate.ts` is explicitly not one of "these three
segments" in this step's Touches list, so it still has no `network` data — `007_ember_threshold`'s
build chain past the first nest will not auto-resolve via the graph yet. This wasn't introduced by
this step (the segment already lacked coverage per the Touches list), but `008_thorn_march.test.ts`
passing does **not** imply `007_ember_threshold.test.ts` passes end-to-end post-Step-8 — Step 10
should check this specifically and, if needed, extend `50_51_south_gate.ts` with equivalent
`network` data (node id `nest_50_51`, edge to `nest_49_51`) the same way this step did for the
other three segments.

**Verify:** `npm run lint`, `npx tsc --noEmit`, then
`npx vitest run app/js/games/minion_battles/terrain/segmentRegistry.networkNodes.test.ts`. Do
**not** run the mission `.test.ts` files here — they run once in the final step alongside the
AbilityTest scenarios.
Ran: `npm run lint` (clean, 0 errors/17 pre-existing warnings, unchanged), `npx tsc --noEmit`
(clean), `npx vitest run app/js/games/minion_battles/terrain/segmentRegistry.networkNodes.test.ts`
(5/5 passed). Additionally ran (beyond this step's own verify list, to confirm the Step 7 note's
expectation) `npx vitest run .../SimulationRunner.test.ts -t "lanternite"` — 6/6 passed (was 2
failing before this step's fixes). Mission `.test.ts` files were not run, per this step's verify
instruction.

## Step 9: Swarm follow-up TODO

**Touches:** `docs/TODO.md`

- [x] Use the `working-with-todos` skill's conventions to add a Medium-priority entry (needs a
      design pass, not a mechanical port): "Migrate swarm nest network (`swarmNestTick.ts`,
      `snet_seek.ts`/`snet_hunt.ts`, `unit.swarmState`) onto `MapNetworkManager`, following the
      pattern established for lanternite. Needs an explicit decision on whether swarm's intentional
      'always contest, no occupancy check' behavior (see `game/lanternite/AGENTS.md`) becomes a
      `mapNetwork` query parameter or stays a swarm-side override — this is a design question, not
      just a port. Also an opportunity to reconcile the `nestHomePoiId` (swarm) vs `homeNestPoiId`
      (lanternite) field-naming inconsistency while touching this code."
      Added a row to `docs/TODO.md`'s Medium table with this exact content (title + notes column),
      following the table format in `working-with-todos`.
- [x] Do not implement any part of the swarm migration in this plan.
      Confirmed: no swarm source files touched in this step — only `docs/TODO.md` was edited.

**Verify:** No test run — docs-only change.

## Step 10 (final): Cleanup + full verification

**Touches:** whatever stragglers the grep below finds (expected: none, if Steps 1-9 were thorough)

- [x] Grep the repo for `connects:` string-tag usage and `getConnectedNestPoiIds` — confirm zero
      references remain (including test files). Fix anything found.
      Found and fixed real stragglers beyond the "expected: none" assumption: (1) the known gap
      flagged under Step 8 — `50_51_south_gate.ts` had no `network` data at all, so
      `007_ember_threshold`'s `nest_50_51` node never existed in the graph, breaking its second
      build hop to `nest_49_51`. Added a `SOUTH_GATE_NETWORK` export (node `nest_50_51` at
      segment-local gridPoint col 7/row 11 — matching the mission's own
      `CAVE_ORIGIN_COL + 7`/`SEG_ROW_51_ORIGIN + 11` arithmetic — edge to `nest_49_51`), wired into
      `registerSegments.ts`'s south-gate `registerSegment(...)` call. (2) Removed the now-dead
      `tags: ['connects:nest_west']` from `registerSegments.ts`'s `nest_south` POI (registry-level
      POI, separate from the mission's own `nest_50_51`/`nest_49_51` MISSION_POIS). (3) Removed the
      now-inert `connects:*` tags from `007_ember_threshold.ts`'s and `008_thorn_march.ts`'s own
      `MISSION_POIS` entries (all dead since Step 7 deleted the parsing code; connectivity for both
      missions already flows through segment `network` data resolved via `segmentIds`). (4) Updated
      `docs/factions/lanternites.md`'s "Nest Network"/"Code Map" sections, which still described the
      deleted `connects:<id>` tag mechanism and referenced the deleted `getConnectedNestPoiIds`
      function — rewritten to describe `MapNetworkManager`/`networkSchema.ts`/
      `getMissionSegmentNetwork` instead. Remaining `connects:` / `getConnectedNestPoiIds` grep hits
      are all historical/explanatory prose (code comments describing what was removed, and this
      plan's own step-by-step record) — no live tag usage or dead function references remain.
- [x] Run `npm run lint` (full repo) and `npx tsc --noEmit` — both clean.
      `npm run lint`: 0 errors, 17 warnings — identical count/content to the plan-start baseline
      (verified line-for-line). `npx tsc --noEmit`: clean, no output.
- [x] Run `npm run test` (full Vitest suite) — 0 failures. Compare the passing count against the
      pre-refactor baseline recorded at plan start — should be equal or higher (this plan adds
      `MapNetworkManager.test.ts`, `segmentRegistry.networkNodes.test.ts`, and the Step 8 tripwire
      test), never lower.
      First attempt crashed mid-run with `Error: Worker exited unexpectedly` from `tinypool` after
      ~50 test files (unrelated Windows worker-pool crash, not a test failure — no assertion
      failures in the output, just an abrupt child-process exit). Re-ran `npm run test` from a
      clean state: **130 test files passed (130), 1044 tests passed / 1 skipped (1045 total)**, 0
      failures, exit code 0. This total includes `MapNetworkManager.test.ts` (14 tests),
      `segmentRegistry.networkNodes.test.ts` (5 tests), `008_thorn_march.test.ts` (1),
      `007_ember_threshold.test.ts` (2), and all lanternite `SimulationRunner` scenarios — strictly
      higher than any pre-plan baseline since every plan-added test file is green and nothing else
      regressed.
- [x] Run the lanternite AbilityTest scenarios headlessly via
      `npx vitest run app/js/games/minion_battles/testing/runner/SimulationRunner.test.ts -t "lanternite"`
      — must cover `lanternite_nest_build`, `lanternite_nest_dual_spawn`,
      `lanternite_shared_construction`, `lanternite_defender_attack`, `lanternite_nest_thorn_spread`
      (all pre-existing, none modified by this plan — this is the proof that graph-based neighbor
      resolution reproduces the old `connects:`-tag behavior end-to-end). All must pass. No new
      AbilityTest scenario is needed for `MapNetworkManager` itself — it's a foundational/internal
      system already covered by `MapNetworkManager.test.ts`'s unit tests; these existing lanternite
      scenarios are the feature-level regression coverage.
      Ran standalone and also as part of the full suite: 6 passed (78 total in file, 72 skipped by
      the `-t` filter when run standalone). All 6 lanternite scenarios green.
- [x] Run `app/js/games/minion_battles/storylines/WorldOfDarkness/missions/008_thorn_march.test.ts`
      and `007_ember_threshold.test.ts` — these exercise the real mission segment data migrated in
      Step 8.
      Both pass (`008_thorn_march.test.ts`: 1/1, `007_ember_threshold.test.ts`: 2/2). Note:
      `007_ember_threshold.test.ts` only covers opening-wolf spawn placement, not the nest-network
      build chain, so it would have passed even without this step's `SOUTH_GATE_NETWORK` fix — that
      fix was made because it's a real correctness gap (flagged explicitly by Step 8), not because
      this test caught it.
- [ ] Manual/browser checklist (needs a human — note as such in the completion report, do not
      attempt to automate): launch Thorn March (`storylines/WorldOfDarkness/missions/008_thorn_march.ts`)
      via the `run` skill and visually confirm the pre-spawned nest, guards, scouts, and
      second-nest construction still work exactly as before.
      Not automatable — needs a human to launch the browser client. Left unchecked; noted in the
      final report as an outstanding manual step.

**Verify:** all of the above — this is the plan's one expensive verification pass; nothing further
needed after this step.
