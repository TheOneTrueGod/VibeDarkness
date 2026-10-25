# Migrate the swarm nest network onto `MapNetworkManager`

**Status: Complete (2026-07-16).** All 6 steps implemented and verified. Swarm nests now select
targets via `MapNetworkManager` (`findUnclaimedNetworkNode`) instead of the old flat `mapPOIs` scan,
preserving both design invariants (always-contest, nearest-anywhere-in-graph). The
`nestHomePoiId`→`homeNestPoiId` rename landed across all 4 touched files. New
`swarmlingContestsOccupiedNestScenario` AbilityTest covers the migrated selection logic. Full suite:
130 test files / 1046 tests passed, 0 failures, 1 skipped. TODO entry closed out in `docs/TODO.md`.
One follow-up needs a human: manually launching Thorn March to visually confirm swarmling
seek/contest behavior in the browser (not automatable, noted in Step 6).

## Context

The lanternite nest network was already migrated off ad-hoc `connects:<id>` POI tags onto the
generic `MapNetworkManager` (graph of nodes/edges, ownership/membership queries) — see the archived
plan `docs/plans/done/map-network-manager.md`. The swarm nest network
(`app/js/games/minion_battles/game/lanternite/swarmNestTick.ts` — yes, it lives in the `lanternite/`
folder; see `game/lanternite/AGENTS.md` line 3) still uses its own, older connectivity mechanism:
`findUnclaimedNestPoi` does a flat nearest-POI scan over **every** `type === 'nest'` POI on the
mission (via `mapPOIs` + `terrainGrid.gridToWorld`), not a graph query. This is the follow-up TODO
recorded in `docs/TODO.md` ("Migrate swarm nest network... onto `MapNetworkManager`").

This plan finishes that TODO: swarm nests move onto `MapNetworkManager` the same way lanternite did
— same opt-in mechanism, same manager, same node/edge data (the three WorldOfDarkness segments
swarm nests currently spawn on **already carry `network` data** from the lanternite migration, so
no new segment authoring is needed).

### Confirmed design decisions (do not re-litigate)

1. **Preserve "always contest, no occupancy check" exactly.** `game/lanternite/AGENTS.md` (line 29)
   documents this as *intentional design*: swarm nests target a POI regardless of who already
   holds it, which is what drives the contested-nest-site fights the lanternite side reacts to
   (`isNestSiteContested` in `lnet_scout_travel.ts`). The migrated selection function must **not**
   call `mapNetwork.getOwnerCharacterId` (or any other cross-faction query) to exclude occupied
   nodes. It keeps excluding only nodes already claimed by the swarm's **own** units, via
   `unit.swarmState.homeNestPoiId`/`targetNestPoiId` — exactly the same exclusion semantics as
   today, just sourced from `MapNetworkManager` node ids instead of `mapPOIs` entries. This is a
   pure data-source swap, not a behavior change to occupancy logic.
2. **Keep the "nearest node anywhere in the graph" selection algorithm — do not switch to
   neighbor-only graph traversal.** Lanternite's `findUnoccupiedConnectedNestPoi` only considers
   direct graph neighbors of a specific home node (`mapNetwork.getNeighborIds`). Swarm's current
   `findUnclaimedNestPoi` instead scans **every** nest POI on the map and picks the nearest by
   Euclidean distance from the spawning nest — it has no concept of "neighbors of X." Switching to
   neighbor-only traversal would be a real gameplay/expansion-pattern change nobody asked for. The
   migrated function keeps the exact same "nearest across all `mapNetwork` nodes" algorithm; only
   the node data source changes (from `mapPOIs` filtered by `type === 'nest'`, to
   `mapNetwork.getAllNodeIds()`/`getNode()`).
3. **No AI-tree changes.** `snet_seek.ts`/`snet_hunt.ts` never call any network utility directly —
   they read `unit.swarmState.targetNestPoiId`, look it up in `context.mapPOIs` (a `MapSegmentPOI`
   list, separate from `mapNetwork`), and call `context.terrainManager.grid.gridToWorld(...)` for
   the world position to path toward. This still works unchanged after the migration: the existing
   WorldOfDarkness segments keep their `pointsOfInterest` entries (only the dead `connects:` tags
   were removed in the lanternite migration) with the **same ids** as the new `network` nodes, so
   `snet_seek.ts`'s POI lookup keeps resolving correctly. Confirmed only one call site for
   `findUnclaimedNestPoi` exists (inside `swarmNestTick.ts` itself), so this is a self-contained
   rewrite of that one file plus its `GameEngine.ts` call site.
4. **`nestHomePoiId` → `homeNestPoiId` rename is in scope.** The TODO explicitly calls out this
   naming inconsistency vs. lanternite's `homeNestPoiId` as "an opportunity to reconcile... while
   touching this code." It's a small, mechanical, self-contained rename (4 files, confirmed by
   grep) — do it as part of this migration rather than leaving it for later.
5. **Turning on `getUnitParticipatesInMapNetwork` for `swarmling`/`swarm_nest` has one accepted
   side effect worth calling out explicitly so nobody "fixes" it by accident:** lanternite's
   existing `findUnoccupiedConnectedNestPoi` already calls `mapNetwork.getOwnerCharacterId(...)` to
   skip nodes owned by *some* character. Once swarm units opt in, a node occupied by a live
   `swarm_nest` will correctly report that ownership to lanternite's query too (previously it
   couldn't, since swarm wasn't tracked by the manager at all). This makes lanternite's own
   occupancy query more accurate — it is not a new coupling between the two systems, and it does
   not touch swarm's own "always contest" behavior (decision #1). No code changes needed for this;
   it falls out of the opt-in flag naturally. Note it in the plan so it isn't mistaken for a
   regression during review.

### What already exists (read these first — do not recreate)

- **`MapNetworkManager`** (`app/js/games/minion_battles/game/managers/mapNetwork/MapNetworkManager.ts`)
  — the manager itself, already built and used by lanternite. Query API: `getNode(id)`,
  `getNeighborIds(id)`, `getAllNodeIds()`, `getOwnerCharacterId(id, units)`, etc. This plan only
  needs `getAllNodeIds()` and `getNode(id)` — no neighbor traversal (see decision #2).
- **`lanterniteNetworkUtils.ts`/`lanterniteNestTick.ts`** — the reference migration. Same
  `Pick<MapNetworkManager, ...>` param-typing convention (`type MapNetworkQuery = Pick<...>` at
  `lanterniteNestTick.ts:36`), same "drop the `terrainGrid` param once node positions come from the
  manager as mission-global px" cleanup.
- **`getUnitParticipatesInMapNetwork`** (`app/js/games/minion_battles/game/units/unit_defs/unitDef.ts:666-669`)
  — the existing opt-in accessor, currently `true` only for `lanternite`/`lanternite_nest`
  (`unitDef.ts:312`, `:325`). This plan flips it on for `swarmling`/`swarm_nest` too — no manager
  changes needed, `MapNetworkManager.tick()` is already characterId-agnostic.
- **Existing `network` data on WorldOfDarkness segments** — `49_51_west_glade.ts`,
  `49_52_thorn_path.ts`, `48_52_thorn_path_2.ts` already export `network` data with nodes
  `nest_49_51`/`nest_49_52`/`nest_48_52` (from the lanternite migration). `008_thorn_march.ts` is
  the **only** mission that pre-spawns a `swarm_nest` (`nestPoiId: 'nest_48_52'`,
  `008_thorn_march.ts:341-347`, with an active `nestConfig` — it does spawn swarmlings during play).
  No new segment/mission authoring is needed.
- **`swarmlings.ts`** (`app/js/games/minion_battles/testing/scenarios/general/swarmlings.ts`) — the
  two existing AbilityTest scenarios: `swarmlingHuntAndBiteScenario` (pure combat, no network) and
  `swarmlingSharedConstructionScenario` (hardcodes `targetNestPoiId` directly via `registerMapPOIs`,
  bypassing `findUnclaimedNestPoi` entirely). Both are unaffected by this migration and must stay
  green.

## Agent Instructions

This plan is executed by **`/jp-implement-plan`**. Read `.claude/skills/jp-implement-plan/SKILL.md`
for the full orchestrator/worker workflow — the invoking agent is the sole orchestrator, spawning
one worker per step **synchronously**, waiting for each to finish, then reporting completion to
the user. Each worker implements exactly one step, checks off its items with a one-line summary,
and stops without spawning the next agent.

Relevant project skills for workers to apply as needed: **`working-on-minion-battles`**,
**`working-on-ai-controllers`** (Step 1 context only — no AI-tree files are touched, see decision
#3), **`scoped-testing`** (per-step test selection), **`working-with-todos`** (Step 6, closing out
the TODO entry), **`ability-tests`** (final step only).

## Step 1: Unit-def opt-in

**Touches:** `app/js/games/minion_battles/game/units/unit_defs/unitDef.ts`

- [x] Set `participatesInMapNetwork: true` on the `swarmling` (`unitDef.ts:283-296`) and
      `swarm_nest` (`unitDef.ts:349-...`) entries in `UNIT_DEFS`, mirroring exactly how
      `lanternite`/`lanternite_nest` do it (`unitDef.ts:312`, `:325`). No other changes — the
      opt-in mechanism itself (`getUnitParticipatesInMapNetwork`, `MapNetworkManager.tick()`'s
      filter) already exists and is characterId-agnostic.
      Summary: added `participatesInMapNetwork: true` to the `swarmling` and `swarm_nest` entries
      in `UNIT_DEFS` (unitDef.ts), matching the lanternite/lanternite_nest pattern exactly; no other
      lines changed.

**Verify:** `npm run lint`, `npx tsc --noEmit`. No test run needed — this flag has no live callers
of `getOwnerCharacterId`/`getUnitCountsByCharacterId` for swarm yet until Step 2 lands; the
`MapNetworkManager.test.ts` opt-in-mechanism test already covers the generic behavior.

## Step 2: Rewrite the connectivity lookup in `swarmNestTick.ts`

**Touches:** `app/js/games/minion_battles/game/lanternite/swarmNestTick.ts`

- [x] Rename `findUnclaimedNestPoi` → `findUnclaimedNetworkNode`. New signature:
      `findUnclaimedNetworkNode(sourceX: number, sourceY: number, mapNetwork: Pick<MapNetworkManager,
      'getAllNodeIds' | 'getNode'>, allUnits: readonly Unit[]): NetworkNode | null` (import
      `MapNetworkManager` from `../managers/mapNetwork/MapNetworkManager` and `NetworkNode` from
      `../managers/mapNetwork/types` — same relative paths `lanterniteNestTick.ts` already uses
      from this same folder). Body: build `occupiedNodeIds` from live units' `swarmState`
      `homeNestPoiId`/`targetNestPoiId` **exactly as today** (same-faction-only — see design
      decision #1, do not add `getOwnerCharacterId`), then iterate
      `mapNetwork.getAllNodeIds()`/`getNode(id)` picking the nearest by Euclidean distance from
      `(sourceX, sourceY)` — same "nearest anywhere in the graph" algorithm as today (design
      decision #2), just sourced from the manager instead of `mapPOIs` filtered by
      `type === 'nest'`. Add a code comment on this function recording design decisions #1 and #2
      explicitly (why there's no `getOwnerCharacterId` call, why there's no neighbor restriction)
      so a future reader doesn't "fix" it into matching lanternite's neighbor-restricted,
      ownership-excluding version by mistake.
      Summary: renamed to `findUnclaimedNetworkNode`, new signature takes a `MapNetworkQuery`
      (`Pick<MapNetworkManager, 'getAllNodeIds' | 'getNode'>`, type alias declared next to the
      function, mirroring `lanterniteNestTick.ts`'s `MapNetworkQuery` convention) instead of
      `allPois`/`terrainGrid`; occupancy check unchanged (same-faction-only via
      `swarmState.nestHomePoiId`/`targetNestPoiId`); iterates `getAllNodeIds()`/`getNode(id)`
      picking nearest by Euclidean distance — same algorithm, new data source. Added a doc comment
      recording design decisions #1/#2 so it isn't "fixed" to match lanternite's neighbor-restricted,
      ownership-excluding version.
- [x] Update the **construction-completion** call site (currently ~`swarmNestTick.ts:184-187`:
      `allPois.find(p => p.id === targetPoiId)` + `terrainGrid.gridToWorld(...)`) to instead call
      `mapNetwork.getNode(targetPoiId)` directly for the new nest's spawn world position (`.x`/`.y`
      already mission-global px — no `gridToWorld` conversion needed, mirrors lanternite's
      `lanterniteNestTick.ts` cleanup).
      Summary: replaced with `const targetNode = targetPoiId ? (params.mapNetwork?.getNode(targetPoiId)
      ?? null) : null;` and the new-nest `placement` now uses `targetNode.x`/`targetNode.y` directly
      (no `gridToWorld`).
- [x] Update the **spawn-time target-selection** call site (currently ~`swarmNestTick.ts:239-241`)
      to call `findUnclaimedNetworkNode(nest.x, nest.y, mapNetwork, params.units)` and use the
      returned node's `.id` for `targetNestPoiId`.
      Summary: replaced the `terrainGrid`/`allPois`-gated block with
      `if (params.mapNetwork) { const targetNode = findUnclaimedNetworkNode(nest.x, nest.y,
      params.mapNetwork, params.units); ... }`.
- [x] `processSwarmNests`'s param object: add `mapNetwork?: Pick<MapNetworkManager, 'getAllNodeIds'
      | 'getNode'>;` (optional, matching `mapPOIs?`'s existing optionality convention in this same
      function). Remove the now-fully-dead `terrainGrid?: TerrainGridLike | null` param and the
      `TerrainGridLike` interface (`swarmNestTick.ts:35-37`) — confirm via grep within this file
      that nothing else references `terrainGrid`/`TerrainGridLike` after the two call-site changes
      above. Leave `mapPOIs`/`allPois` alone — still needed to populate `SpawnUnitContext.mapPOIs`
      for the generic `spawnUnit` call, unrelated to this migration.
      Summary: added `mapNetwork?: MapNetworkQuery;` param, removed `terrainGrid` param and the
      `TerrainGridLike` interface. Also removed the two local `const terrainGrid = ...`/`const
      allPois = params.mapPOIs ?? [];` convenience variables — both became fully dead once their
      only two call sites (above) moved to `params.mapNetwork`; `spawnCtx.mapPOIs` already reads
      `params.mapPOIs` directly (line ~132) so the `mapPOIs` param itself is untouched, only the
      now-orphaned local alias was removed to keep lint's unused-var rule clean. Grepped the file
      afterward — zero remaining `terrainGrid`/`TerrainGridLike`/`findUnclaimedNestPoi`/`allPois`
      references.

**Verify:** `npm run lint`, `npx tsc --noEmit` (signature change). No test run yet — `GameEngine.ts`
doesn't pass `mapNetwork` into `processSwarmNests` until Step 3, so nothing exercises the new code
path until then; a test run here would only prove the file compiles, which `tsc` already confirms.

**Note for Step 3's worker (interim state, expected):** `npm run lint` is clean (0 errors — only
17 pre-existing warnings across unrelated files, none in `swarmNestTick.ts`). `npx tsc --noEmit`
currently reports exactly **one** error, in `GameEngine.ts:1474` — `terrainGrid` no longer exists on
`processSwarmNests`'s param type. This is expected and self-contained: `GameEngine.ts` is Step 3's
own "Touches" file, and Step 3's checklist item already says to remove that exact
`terrainGrid: this.terrainManager?.grid ?? null,` line and add `mapNetwork:
this.state.mapNetworkManager,` in its place. The plan's Step 2 "Verify" line's claim that `tsc`
passes cleanly *after Step 2 alone* doesn't hold — the signature change is a two-file change split
across Steps 2 and 3, so `tsc` is only fully green again once Step 3 lands. Not a regression to
chase; just land Step 3 next.

## Step 3: Wire `mapNetwork` into the `GameEngine.ts` call site

**Touches:** `app/js/games/minion_battles/game/GameEngine.ts`

- [x] In the `processSwarmNests({...})` call inside `fixedUpdate()` (currently
      `GameEngine.ts:1469-1479`), add `mapNetwork: this.state.mapNetworkManager,` (mirrors the
      `processLanterniteNests` call a few lines above at `GameEngine.ts:1454`) and remove
      `terrainGrid: this.terrainManager?.grid ?? null,` (now unused per Step 2). Leave `mapPOIs:
      this.mapPOIs,` as-is.
      Summary: replaced `terrainGrid: this.terrainManager?.grid ?? null,` with `mapNetwork:
      this.state.mapNetworkManager,` in the `processSwarmNests({...})` call (GameEngine.ts
      `fixedUpdate()`), matching the `processLanterniteNests` call's `mapNetwork` wiring above it;
      `mapPOIs: this.mapPOIs,` left unchanged.

**Interim-state fix found during this step's verify (not a checklist item, noted for Step 5's
worker):** wiring `mapNetwork` through in this step is what first exercises
`processSwarmNests`'s construction-completion path (`swarmNestTick.ts`'s `targetNode =
params.mapNetwork?.getNode(targetPoiId)`) end-to-end via the real engine tick loop — Step 2's
verify explicitly deferred any test run for this reason. That exposed a real gap:
`swarmlingSharedConstructionScenario` (`testing/scenarios/general/swarmlings.ts`) hardcodes
`targetNestPoiId = 'swarm_shared_site'` and registers that id only as a `mapPOIs` entry (via
`registerMapPOIs`), never as a `mapNetworkManager` node — so once construction-completion started
resolving the new nest's spawn position via `mapNetwork.getNode(...)` instead of the old
`mapPOIs.find(...)` + `terrainGrid.gridToWorld(...)`, `getNode` returned `undefined` and the scenario's
nest never spawned (`SimulationRunner.test.ts`'s "passes swarmling shared construction scenario"
failed: 0 alive nests). Fixed by adding a matching `engine.mapNetworkManager.loadFromSegments({
nodes: [{ id: 'swarm_shared_site', ... }], edges: [] })` call in `swarmlings.ts`'s
`buildEngine()`, mirroring `lanternites.ts`'s existing `loadFromSegments` test pattern (no edges
needed — this scenario hardcodes `targetNestPoiId` directly and never calls
`findUnclaimedNetworkNode`, so no graph traversal occurs). This is a test-file fix only; no
production behavior changed. `swarmlingHuntAndBiteScenario` (the other existing scenario, pure
combat, no nest POI at all) was unaffected. Flagging here since `swarmlings.ts` is nominally
Step 5's "Touches" file — Step 5's worker should be aware this scenario now also registers network
data, in case it affects how the new `swarmlingContestsOccupiedNestScenario` is authored.

**Verify:** `npm run lint`, `npx tsc --noEmit`, then
`npx vitest related app/js/games/minion_battles/game/GameEngine.ts --run`.

## Step 4: Rename `nestHomePoiId` → `homeNestPoiId`

**Touches:** `app/js/games/minion_battles/game/units/unitSwarmState.ts`,
`app/js/games/minion_battles/game/lanternite/swarmNestTick.ts`,
`app/js/games/minion_battles/game/units/spawning/spawnUnit.ts`,
`app/js/games/minion_battles/game/units/Unit.test.ts`

- [x] `unitSwarmState.ts`: rename the `UnitSwarmState.nestHomePoiId` field to `homeNestPoiId`
      (interface, `createSwarmState()`'s initializer). Rename the serialized JSON key from
      `swarmNestHomePoiId` to `swarmHomeNestPoiId` in both `swarmStateToJSON`/
      `applySwarmStateFromJSON` — no backwards-compat shim needed (checkpoints are short-lived
      session artifacts, matching how the project already treats other in-session-only state).
      Summary: renamed the interface field, `createSwarmState()`'s initializer, and both JSON
      key/read sites (`swarmNestHomePoiId` → `swarmHomeNestPoiId`) with no compat shim.
- [x] `swarmNestTick.ts`: update the two `u.swarmState.nestHomePoiId` reads (in
      `findUnclaimedNetworkNode`'s occupancy check, and the construction-completion
      "alreadyOccupied" check) to `homeNestPoiId`.
      Summary: updated both reads (occupancy check, alreadyOccupied check) to
      `u.swarmState.homeNestPoiId`.
- [x] `spawnUnit.ts:431` (`if (hookup.homeNestPoiId != null) unit.swarmState.nestHomePoiId =
      hookup.homeNestPoiId;` — note the `aiHookup` field itself is already named `homeNestPoiId`,
      only the `unit.swarmState.*` assignment target was backwards): update the assignment target
      to `unit.swarmState.homeNestPoiId`.
      Summary: updated the `swarmNest` hookup case's assignment target to
      `unit.swarmState.homeNestPoiId`; `aiHookup.homeNestPoiId` source field was already correctly
      named and untouched.
- [x] `Unit.test.ts:141` (`unit.swarmState.nestHomePoiId = 'swarm_home_poi';`): update to
      `homeNestPoiId`.
      Summary: updated the field assignment; regenerated the golden serialization inline snapshot
      via `vitest -u` — `git diff` confirms the only change is the renamed key
      (`swarmNestHomePoiId` → `swarmHomeNestPoiId`) moving to its new alphabetically-sorted
      position, nothing else in the snapshot changed.
- [x] Grep the repo for any remaining `nestHomePoiId` reference (including test/scenario files) —
      confirm zero remain.
      Summary: grepped the full repo — zero remaining `nestHomePoiId` references in any
      source/test/scenario file; remaining hits are only in this plan file and other docs/plans
      files (`docs/plans/done/unit-ts-split.md`, `docs/plans/done/map-network-manager.md`)
      referencing the old name historically, plus `docs/TODO.md`'s row (Step 6's job to remove it).

**Verify:** `npm run lint`, `npx tsc --noEmit`, then
`npx vitest related app/js/games/minion_battles/game/units/Unit.test.ts app/js/games/minion_battles/game/lanternite/swarmNestTick.ts --run`.

## Step 5: AbilityTest coverage for the migrated selection logic

**Touches:** `app/js/games/minion_battles/testing/scenarios/general/swarmlings.ts`,
`app/js/games/minion_battles/testing/scenarios/registry.ts`,
`app/js/games/minion_battles/testing/runner/SimulationRunner.test.ts`

Neither existing swarmling scenario exercises `findUnclaimedNetworkNode`/graph-based selection at
all (both hardcode `targetNestPoiId` directly or test pure combat) — this migration currently has
**no** regression coverage for the actual connectivity change. Add one new scenario that proves
both design decisions #1 and #2 at once (nearest-wins **and** always-contest), the way
`lanternites.ts`'s scenarios register a manual graph via `engine.mapNetworkManager.loadFromSegments`
(see `swarmlings.ts`'s and `lanternites.ts`'s existing patterns for `buildTinyBattleEngine` +
`registerMapPOIs` + `createUnitFromSpawnConfig`).

- [x] Add `swarmlingContestsOccupiedNestScenario` to `swarmlings.ts`: register two network nodes via
      `engine.mapNetworkManager.loadFromSegments(...)` (mirroring `lanternites.ts`'s pattern) — one
      node **near** the swarm_nest but already "owned" by a live, opted-in non-swarm unit standing
      exactly on it (e.g. spawn a `lanternite_nest` there, or any unit whose `characterId` differs
      from `swarm_nest`/`swarmling`), and one node **farther away** and genuinely unclaimed. Spawn a
      `swarm_nest` (with an active `nestConfig`, `maxSwarmlings >= 1`) near the occupied node and
      let `processSwarmNests` run a tick. Assert the spawned swarmling's
      `swarmState.targetNestPoiId` is the **near, occupied** node — proving (a) selection is
      still nearest-by-distance across all graph nodes (decision #2), not neighbor-restricted, and
      (b) the occupied-by-another-faction node was **not** excluded (decision #1 — "always
      contest" survived the migration). If a future change accidentally added
      `getOwnerCharacterId`-based exclusion, this scenario would fail by picking the far node
      instead.
      Summary: added `swarmlingContestsOccupiedNestScenario` to `swarmlings.ts` (after the existing
      shared-construction scenario, reusing its `swarmWorldOf` helper). Registers `contest_near_node`
      (radius 20, close to the nest) and `contest_far_node` (radius 20, far away) via
      `engine.mapNetworkManager.loadFromSegments(...)` with no edges; spawns a `lanternite_nest`
      unit exactly on `contest_near_node` (a different characterId/faction, opted into the network)
      and a `swarm_nest` with `nestConfig = { maxSwarmlings: 1, spawnIntervalSec: 1 }` and
      `nestSpawnState = { spawnedIds: [], nextSpawnAtGameTime: 0 }` so it spawns its first swarmling
      on tick one. Asserts the spawned swarmling's `swarmState.targetNestPoiId === 'contest_near_node'`.
- [x] Register the new scenario in `registry.ts` (import + add to the scenario list, same pattern
      as the existing two swarmling scenarios) and add an `it(...)` case to
      `SimulationRunner.test.ts` (mirror the two existing swarmling `it` blocks at
      `SimulationRunner.test.ts:330-338`).
      Summary: added `swarmlingContestsOccupiedNestScenario` to the `./general/swarmlings` import and
      to `ALL_ABILITY_TEST_SCENARIOS` in `registry.ts` (right after
      `swarmlingSharedConstructionScenario`), and added a matching `it('passes swarmling contests
      occupied nest scenario (nearest node wins, always contests)', ...)` case to
      `SimulationRunner.test.ts` right after the existing shared-construction `it` block.
- [x] Run just the new scenario (and the two existing swarmling scenarios, to confirm no
      regression) via the runner test file.
      Summary: `npx vitest run app/js/games/minion_battles/testing/runner/SimulationRunner.test.ts -t
      "swarm"` — 4 passed (hunt-and-bite, shared construction, the new contest scenario, and the
      unrelated "World Modifiers: swarmling death spawns dark light" case which also matches "swarm"),
      0 failed.

**Verify:** `npm run lint`, `npx tsc --noEmit`, then
`npx vitest run app/js/games/minion_battles/testing/runner/SimulationRunner.test.ts -t "swarm"`.

## Step 6: Close out the TODO + final verification

**Touches:** `docs/TODO.md`, whatever stragglers the grep below finds (expected: none)

- [x] Remove the "Migrate swarm nest network... onto `MapNetworkManager`" row from `docs/TODO.md`'s
      Medium table (use the `working-with-todos` skill's conventions for removing a completed
      item) — this plan fully implements it, including the field-naming reconciliation the TODO
      called out.
      Summary: removed the row from `docs/TODO.md`'s Medium table; appended a matching row (with a
      2026-07-16 Date column) to `docs/todo-verify.md`'s Medium table per the `working-with-todos`
      skill's completion convention.
- [x] Grep the repo for `findUnclaimedNestPoi` and `nestHomePoiId` — confirm zero references remain
      anywhere (source, tests, comments). Fix anything found.
      Summary: grepped the full repo — zero remaining references in any source/test/comment file.
      The only hits are historical mentions in markdown docs (this plan file itself,
      `docs/plans/done/map-network-manager.md`, `docs/plans/done/unify-spawn-system.md`,
      `docs/plans/done/unit-ts-split.md`, and the new `docs/todo-verify.md` completion-note added by
      this step's first item) — all expected, none are stragglers to fix.
- [x] Run `npm run lint` (full repo) and `npx tsc --noEmit` — both clean.
      Summary: `npm run lint` → 0 errors, 17 pre-existing warnings (same set noted in Step 2's
      verify, none in migration-touched files). `npx tsc --noEmit` → no output, exit clean.
- [x] Run `npm run test` (full Vitest suite) — 0 failures, pass count equal or higher than the
      pre-migration baseline recorded at plan start (this plan adds one new AbilityTest scenario).
      Summary: 130 test files passed (130), 1046 tests passed, 1 skipped, 0 failed. Well above the
      pre-migration baseline of 81 test files / 553 passed / 1 skipped / 0 failed noted at plan
      start (the gap reflects general repo growth since that baseline was recorded, not anything
      specific to this migration) — no failures, no regressions.
- [x] Run the swarm and lanternite AbilityTest scenarios together via
      `npx vitest run app/js/games/minion_battles/testing/runner/SimulationRunner.test.ts -t "swarm"`
      and `-t "lanternite"` — all must pass (proves the migration didn't regress either faction's
      nest behavior, and that the cross-faction `getOwnerCharacterId` side effect from design
      decision #5 doesn't break lanternite's existing scenarios).
      Summary: `-t "swarm"` → 4 passed, 76 skipped, 0 failed. `-t "lanternite"` → 7 passed, 73
      skipped, 0 failed. Both clean.
- [x] Run `app/js/games/minion_battles/storylines/WorldOfDarkness/missions/008_thorn_march.test.ts`
      — the one mission with a live, actively-spawning `swarm_nest` on real segment network data.
      Summary: 1 test file, 1 test, passed.
- [x] Manual/browser checklist (needs a human — note as such in the completion report, do not
      attempt to automate): launch Thorn March via the `run` skill and visually confirm swarmlings
      still seek out and contest nest sites (including ones already held by lanternite) the same
      way they did before the migration.
      Summary: not automated per plan instructions — flagged as outstanding, needs a human to launch
      Thorn March and visually confirm swarmling seek/contest behavior in the browser.

**Verify:** all of the above — this is the plan's one expensive verification pass; nothing further
needed after this step.
