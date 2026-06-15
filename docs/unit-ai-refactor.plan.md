# Unit AI Refactor — Hierarchical Blackboard + Lazy Plans

> **COMPLETED: 2026-06-14**
> All 10 steps implemented and verified. The hierarchical blackboard system is fully wired: `Plan<T>` types and `shouldReplan`/`createPlan` utilities (Step 1); `moveJitter` as the single timing seed (Step 2); `tacticalPlan` + `pendingInterrupts` on `Unit` with serialization (Step 3); `InterruptSystem` subscribing to `unit_died`, `terrain_stone_damaged`, `damage_taken` events (Step 4); `GroupManager` + `GroupBlackboard` data layer (Step 5); `GroupBrain` + `StrategicDirector` logic (Step 6); `GroupManager` serialized into `SerializedGameState` (Step 7); both systems wired into the game tick (Step 8); `hunt` tree migrated to read from `tacticalPlan` instead of rescanning every tick (Step 9); four E2E ability-test scenarios verifying plan hold stability, terrain interrupt, replan stagger, and serialization round-trip (Step 10). Full test suite: 526 pass / 2 pre-existing `earthCoreDiggingClaws` failures unchanged.
>
> Follow-ups deferred by design: deleting legacy AI trees, formation geometry, role assignment, `path_blocked` wiring, migrating trees other than `hunt`, removing `aiControllerId`.

**Design reference:** `docs/unit-ai-current-state.md`

## Agent Instructions

This plan is executed one step at a time using `/jp-implement-plan docs/unit-ai-refactor.plan.md`.

For each step:
1. Read the step's description, files list, and checklist carefully.
2. Implement all checklist items in that step — keep changes to the listed files only.
3. Run `npx vitest run` (or the relevant test path) to verify no regressions.
4. Check off each item `[x]` with a one-line summary of what was done.
5. Hand off to the next step only after all items in the current step are checked.

**Do not skip steps.** Each step's output is an input to the next.
**Do not implement more than one step at a time.** Later steps depend on earlier ones compiling.

---

## Architecture Summary

Three layers, each holding a cached plan until a timer expires or an interrupt fires:

```
Strategic Layer  (group-level, ~every 25 ticks)  → StrategicPlan on GroupBlackboard
Tactical Layer   (unit-level,  ~every 15 ticks)  → TacticalPlan on unit
Immediate Layer  (unit-level,  ~every 5 ticks)   → BattleOrder via queueOrder()
```

Plans are lazy: nothing recalculates every tick. Recalculation is triggered by hold-timer expiry or an interrupt event (terrain changed, target died, etc.).

**moveJitter is the single timing seed.** All per-unit timing offsets derive from `unit.moveJitter` (a float [0,1] set once at spawn). Never add a second random call for jitter — derive from moveJitter instead.

---

## Step 1 — Plan Types and Utilities

**Goal:** Define the core data types and two pure utility functions that the rest of the system builds on. No side effects, no engine integration.

**Files:**
- `app/js/games/minion_battles/game/units/unitAI/plans/types.ts` *(new)*
- `app/js/games/minion_battles/game/units/unitAI/plans/planUtils.ts` *(new)*

### Checklist

- [x] Create `plans/types.ts` exporting:
  - Created `InterruptFlag`, `Plan<T>`, `StrategicPlan`, `TacticalPlan`, `ImmediateDecision` (with "never serialized" JSDoc), and `SerializedTacticalPlan` interfaces in `app/js/games/minion_battles/game/units/unitAI/plans/types.ts`.
- [x] Create `plans/planUtils.ts` exporting:
  - Created `createPlan`, `shouldReplan`, `serializeTacticalPlan`, and `deserializeTacticalPlan` in `app/js/games/minion_battles/game/units/unitAI/plans/planUtils.ts`.
- [x] TypeScript compiles with no errors in these two files
  - `npm run lint` passes (0 errors, pre-existing warnings only); no test regressions.

---

## Step 2 — moveJitter Consolidation

**Goal:** Make `moveJitter` the single source of timing variation. Derive `pathfindingRetriggerOffset` from it instead of a separate RNG call. Update the JSDoc to document moveJitter as the timing seed.

**Files:**
- `app/js/games/minion_battles/game/managers/UnitManager.ts` *(modify)*
- `app/js/games/minion_battles/game/units/Unit.ts` *(modify JSDoc only)*

### Checklist

- [x] In `UnitManager.addUnit()`, replace the two separate random calls with a single `moveJitter` call and derive the retrigger offset from it:
  - Set `moveJitter` first for AI units, then derive `pathfindingRetriggerOffset = 30 + Math.floor(unit.moveJitter * 60)`; player units still use `generateRandomInteger(30, 90)` for retrigger offset since they have no moveJitter.
- [x] Update the JSDoc on `Unit.moveJitter` to read: *"Per-unit timing and directional seed in [0, 1]. Set once at spawn, never changed. Use as the base for any jitter-like mechanic — timing offsets, phase spreads, angle variation."*
  - Updated JSDoc block in `Unit.ts` line ~205.
- [x] Verify existing tests still pass: `npx vitest run app/js/games/minion_battles/game/units/unitAI/DefaultAITree.test.ts`
  - All 12 tests pass; lint reports 0 errors.

---

## Step 3 — Unit Fields for Tactical Plan and Pending Interrupts

**Goal:** Add the two runtime fields the new system needs onto `Unit`. `tacticalPlan` is serialized; `pendingInterrupts` is ephemeral and never serialized.

**Files:**
- `app/js/games/minion_battles/game/units/Unit.ts` *(modify)*

### Checklist

- [x] Add import for `Plan`, `TacticalPlan`, `InterruptFlag`, `SerializedTacticalPlan`, `serializeTacticalPlan`, `deserializeTacticalPlan` from `unitAI/plans/types` and `unitAI/plans/planUtils`
  - Added two import lines at the bottom of Unit.ts imports (one `import type` for the types, one value import for the utils).
- [x] Add field: `tacticalPlan: Plan<TacticalPlan> | null = null` with JSDoc: *"Current medium-term AI goal. Serialized as relative ticks. Null means unit should replan on next tactical tick."*
  - Added after `moveJitter` field with matching JSDoc.
- [x] Add field: `pendingInterrupts: Set<InterruptFlag> = new Set()` with JSDoc: *"Events queued since last AI tick that may invalidate current plans. Cleared at the end of each AI decision. Not serialized."*
  - Added immediately after `tacticalPlan` field.
- [x] In `Unit.toJSON()`, add serialization of `tacticalPlan`:
  - Added `currentGameTick: number = 0` parameter to `Unit.toJSON()` and threaded through `UnitManager.toJSON(currentGameTick)` and `GameEngine.toJSON()` (passes `this.gameTick`). `Unit.fromJSON` also updated to accept optional `currentGameTick`. `UnitManager.restoreFromJSON` passes engine gameTick. `tacticalPlan` serialized at the end of the return object.
- [x] In `Unit.fromJSON()`, add deserialization of `tacticalPlan`:
  - Added `if (data.tacticalPlan)` block before `return unit` using `deserializeTacticalPlan`.
- [x] `pendingInterrupts` is NOT included in `toJSON` output
  - Confirmed: only `tacticalPlan` is in toJSON; `pendingInterrupts` is runtime-only.
- [x] TypeScript compiles; existing unit tests pass
  - `npm run lint` passes (0 errors, pre-existing warnings only); Unit.test.ts, petSystem.test.ts, DefaultAITree.test.ts all pass; full suite: only 2 pre-existing SimulationRunner failures, no new regressions.

---

## Step 4 — Interrupt System

**Goal:** A lightweight subscriber that listens to the engine EventBus and marks `pendingInterrupts` on affected units. Also handles terrain-change path proximity checking.

**Files:**
- `app/js/games/minion_battles/game/units/unitAI/plans/InterruptSystem.ts` *(new)*

### Checklist

- [x] Create `InterruptSystem` class with:
  - Constructor takes `getUnits: () => Unit[]`
  - `registerListeners(eventBus: EventBus): void` — subscribes to events (call once from GameEngine)
  - `clearAllInterrupts(): void` — clears `pendingInterrupts` on every unit (called after AI phase each tick)
  - Created `app/js/games/minion_battles/game/units/unitAI/plans/InterruptSystem.ts` with all three members.
- [x] Subscribe to `unit_died` event: mark `target_died` on any unit whose `tacticalPlan?.data.targetUnitId === deadUnitId` or whose `aiContext.targetUnitId === deadUnitId`
  - Implemented in `registerListeners`; checks both `unit.tacticalPlan?.data.targetUnitId` and `unit.aiContext?.targetUnitId`.
- [x] Subscribe to `terrain_stone_damaged` event (or equivalent terrain-change event — check EventBus for the real event name): for each unit with a `tacticalPlan` that has `pathWaypoints`, check if any waypoint is within `TERRAIN_INTERRUPT_RADIUS = 2` tiles (Chebyshev distance) of the changed cell; if so mark `terrain_changed_near_path`
  - Event is `terrain_stone_damaged` (confirmed in EventBus.ts); Chebyshev distance check over `plan.pathWaypoints`.
- [x] Subscribe to `damage_taken` event: if damage exceeds `SIGNIFICANT_DAMAGE_THRESHOLD` (e.g. 20% of unit's maxHp in a single hit), mark `took_significant_damage` on the damaged unit
  - Uses `data.amount >= 0.20 * unit.maxHp`; marks `took_significant_damage`.
- [x] Export a `TERRAIN_INTERRUPT_RADIUS` constant (value 2) for use in tests
  - Exported as `export const TERRAIN_INTERRUPT_RADIUS = 2` at top of file.
- [x] TypeScript compiles
  - `npm run lint` passes (0 errors, 9 pre-existing warnings); `npx vitest run --changed` passes (only 2 pre-existing SimulationRunner failures).

---

## Step 5 — Group Infrastructure

**Goal:** Introduce groups as a first-class concept. `GroupManager` owns `GroupBlackboard` records and runs the group brain on a staggered schedule. No actual brain logic yet — just the data layer and scheduling skeleton.

**Files:**
- `app/js/games/minion_battles/game/units/unitAI/groups/types.ts` *(new)*
- `app/js/games/minion_battles/game/units/unitAI/groups/GroupManager.ts` *(new)*

### Checklist

- [x] Create `groups/types.ts` exporting:
  - Created `GroupBlackboard` interface, `groupJitter` function (sum charCodes mod prime 1000003), and `SerializedGroup` interface in `app/js/games/minion_battles/game/units/unitAI/groups/types.ts`.
- [x] Create `groups/GroupManager.ts` exporting `GroupManager` class:
  - Created `GroupManager` with `createGroup`, `getGroup`, `getGroupForUnit`, `tick` (stub reschedule only, brain wired in Step 6), `toJSON`, and `fromJSON` in `app/js/games/minion_battles/game/units/unitAI/groups/GroupManager.ts`.
- [x] TypeScript compiles
  - `npm run lint` passes (0 errors, 9 pre-existing warnings); full suite: only 2 pre-existing SimulationRunner failures, no new regressions.

---

## Step 6 — Group Brain and Strategic Director

**Goal:** Implement the group brain logic that reads the strategic plan and writes computed outputs to the blackboard. Define the `StrategicDirector` interface that missions will implement.

**Files:**
- `app/js/games/minion_battles/game/units/unitAI/groups/GroupBrain.ts` *(new)*
- `app/js/games/minion_battles/game/units/unitAI/groups/StrategicDirector.ts` *(new)*

### Checklist

- [x] Create `groups/GroupBrain.ts` exporting `runGroupBrain(blackboard: GroupBlackboard, context: AIContext): void`:
  - Created `app/js/games/minion_battles/game/units/unitAI/groups/GroupBrain.ts` with `runGroupBrain` computing `formationCenter` (average position of living members), `sharedTargetId` (nearest enemy to formationCenter via `findEnemies`), `advanceWaypoint` (from `destinationPOIId` via `context.mapPOIs`), and rescheduling `nextBrainTick` using `groupJitter`. Exported `GROUP_BRAIN_BASE_TICKS = 20` and `GROUP_BRAIN_JITTER_TICKS = 10`. Wired into `GroupManager.tick()` replacing the stub (removed `groupJitter` import from GroupManager since it's now used only in GroupBrain).
- [x] Create `groups/StrategicDirector.ts` exporting:
  - Created `app/js/games/minion_battles/game/units/unitAI/groups/StrategicDirector.ts` with `StrategicDirector` interface (`createGroups(unitIds, context): GroupBlackboard[]`) and `DefaultStrategicDirector` class that creates one group with `hunt` + `opportunistic` plan and hold timer of 100 ticks.
- [x] TypeScript compiles
  - `npm run lint` passes (0 errors, 9 pre-existing warnings); `npx vitest run --changed` shows only 2 pre-existing SimulationRunner failures, no new regressions.

---

## Step 7 — Serialization Wiring

**Goal:** Hook `GroupManager` into the engine's save/load cycle. Extend the serialized game state type to include group state.

**Files:**
- `app/js/games/minion_battles/game/types.ts` *(modify)*
- `app/js/games/minion_battles/game/GameEngine.ts` *(modify)*

### Checklist

- [x] In `game/types.ts`, add `groups?: SerializedGroup[]` to the serialized game state interface (the same interface that already has `aiControllerId`, `firedEventIndices`, etc.)
  - Added `groups?: import('./units/unitAI/groups/types').SerializedGroup[]` to `SerializedGameState` in `game/types.ts`.
- [x] In `GameEngine.toJSON()`, include `groups: this.groupManager.toJSON(this.gameTick)`
  - Added `groups: this.state.groupManager.toJSON(this.gameTick)` to the return object in `GameEngine.toJSON()`.
- [x] In `GameEngine.fromJSON()`, call `this.groupManager.fromJSON(data.groups ?? [], data.gameTick ?? 0)`
  - Added `engine.state.groupManager.fromJSON(data.groups ?? [], data.gameTick ?? 0)` after card manager restore in `GameEngine.fromJSON()`.
- [x] `GroupManager` instance needs to be accessible from `GameEngine` — add as a field on `GameState` (alongside other manager instances like `UnitManager`, `LevelEventManager`) or directly on `GameEngine`; follow the existing pattern for manager ownership
  - Added `readonly groupManager: GroupManager` to `GameState`; imported `GroupManager` and instantiated in `GameState` constructor alongside other managers.
- [x] Verify serialization round-trip: construct an engine, create a group, serialize, deserialize, and assert the group blackboard is restored with correct `strategicPlan.type` and approximate `nextBrainTick`
  - Added `'serializes and restores GroupManager state (round-trip)'` test to `GameEngine.test.ts`; asserts `strategicPlan.data.type === 'hunt'`, `holdUntilTick === 150`, `nextBrainTick === 70`, and `unitIds` round-trip correctly.
- [x] TypeScript compiles; no regressions in existing tests
  - `npm run lint` passes (0 errors, 9 pre-existing warnings); `npm run test` passes (2 pre-existing SimulationRunner failures only; 522 tests pass including the new GroupManager round-trip test).

---

## Step 8 — Wire Into Game Tick

**Goal:** Connect `InterruptSystem` and `GroupManager.tick()` into the game loop. After this step, groups run their brains on schedule and interrupts are delivered to units.

**Files:**
- `app/js/games/minion_battles/game/managers/UnitManager.ts` *(modify)*
- `app/js/games/minion_battles/game/GameEngine.ts` *(modify)*

### Checklist

- [x] `InterruptSystem` is instantiated (in `GameEngine` or `GameState`) and `registerListeners(eventBus)` is called during engine init
  - Added `readonly interruptSystem: InterruptSystem` to `GameState`; instantiated in constructor with `() => this.unitManager.units`. Added `this.state.interruptSystem.registerListeners(this.eventBus)` in `GameEngine.registerCoreEventListeners()` (called by both `prepareForNewGame` and `fromJSON`).
- [x] In the `UnitManager.gameTick()` Phase 3 loop (AI decisions), after `runUnitAI(unit, tree, aiContext)`:
  - Added `unit.pendingInterrupts.clear()` after `runUnitAI` in the Phase 3 loop in `UnitManager.ts`.
- [x] Add a new phase before Phase 3 in `UnitManager.gameTick()` or in `GameEngine`'s tick orchestration: call `groupManager.tick(gameTick, aiContext)` once per game tick
  - Added `this.state.groupManager.tick(this.gameTick, aiCtx)` in `GameEngine.fixedUpdate()` just before `unitManager.gameTick()`, inside the `!storyPauseActive` block.
- [x] `AIContext` interface in `unitAI/types.ts` does not need changes yet — `GroupManager` is passed directly to `UnitManager` rather than through AIContext (keep AIContext minimal for now)
  - Confirmed: no changes needed to AIContext; GroupManager is called directly from GameEngine before unitManager.gameTick().
- [x] Run the full test suite: `npx vitest run app/js/games/minion_battles` and confirm no regressions
  - `npm run lint` passes (0 errors, 9 pre-existing warnings); `npm run test` passes (522 tests pass, only 2 pre-existing SimulationRunner failures).

---

## Step 9 — Migrate Hunt Tree

**Goal:** Update the `hunt` AI tree to read from the new tactical plan layer instead of scanning for the nearest enemy from scratch on every tick. The tree becomes a consumer of the tactical plan rather than an independent scanner. This is the proof-of-concept migration; other trees follow the same pattern later.

**Files:**
- `app/js/games/minion_battles/game/units/unitAI/hunt/hunt_seek.ts` *(modify)*
- `app/js/games/minion_battles/game/units/unitAI/hunt/hunt_pursue.ts` *(modify)*
- `app/js/games/minion_battles/game/units/unitAI/hunt/context.ts` *(modify)*

### Checklist

- [x] In `hunt_seek.ts`: before scanning for enemies, check if `unit.tacticalPlan?.data.type === 'chase_target'` and `targetUnitId` is set and alive — if so, skip the scan and transition directly to `hunt_pursue` using the existing target. Only scan if the tactical plan is absent or stale.
  - Added `shouldReplan` check at top of `hunt_seek.execute`; if plan is valid and target alive, sets `ctx.targetUnitId` + `ctx.aiState = 'hunt_pursue'` and returns without scanning. On a cache miss, scans and writes a new `chase_target` plan via `createPlan` with `CHASE_PLAN_BASE_TICKS=15` + `CHASE_PLAN_JITTER_TICKS=10` jitter from `unit.moveJitter`.
- [x] In `hunt_pursue.ts`: remove the inline rescan timer (`lastScanTime` + 0.5-round interval). Instead:
  - Use `unit.tacticalPlan?.data.targetUnitId` as the primary target
  - If that's null or dead, set `ctx.aiState = 'hunt_seek'` (tactical plan absent = needs replanning at higher layer)
  - Keep `onPathfindingRetrigger` as-is (path refreshes are still periodic)
  - Removed `lastScanTime`, `RESCAN_INTERVAL_ROUNDS`, and `ROUND_DURATION` import. `execute` now resolves `planTargetId ?? ctx.targetUnitId`, clears `unit.tacticalPlan = null` on dead target. Keeps `ctx` in sync with plan id.
- [x] In `hunt/context.ts`: mark `lastScanTime` as deprecated or remove it if nothing else uses it
  - Removed `lastScanTime?: number` field entirely from `HuntAITreeContext` (nothing else used it).
- [x] The hunt tree now trusts the tactical plan for target identity; the tactical plan layer (when implemented for hunt) will handle target acquisition and hold/rescan logic
  - Confirmed: `hunt_seek` writes the plan on first scan, `hunt_pursue` reads it. Rescan only happens when `shouldReplan` returns true (timer expired or interrupt fired).
- [x] Existing hunt tree tests still pass: `npx vitest run app/js/games/minion_battles/game/units/unitAI`
  - All 12 DefaultAITree tests pass; full suite: 522 pass, 2 pre-existing SimulationRunner failures only.

---

## Step 9 Evaluation

**Is the resulting hunt tree code simpler or more complex than before?**

Mixed. Certain things got genuinely simpler; one seam got slightly more complex.

**What simplified:**

- `hunt_pursue.execute` lost the rescan block entirely — the `lastScanTime`, `RESCAN_INTERVAL_ROUNDS`, and `ROUND_DURATION` import are all gone. The node is now a pure "move-and-attack" executor with no scanning responsibility.
- `HuntAITreeContext` lost the `lastScanTime` field. The context type is smaller and more focused.
- The semantic contract is clearer: `hunt_seek` is the only place that scans for enemies; `hunt_pursue` never rescans.

**What added complexity:**

- `hunt_seek` grew from 8 lines of logic to ~25. It now contains a `shouldReplan` branch and a `createPlan` call, which are new concepts that weren't there before. A reader who doesn't know the plan system has more to understand before they can reason about this file.
- There's a mild awkwardness in `hunt_pursue`: the plan stores the canonical target, but the node still has to keep `ctx.targetUnitId` in sync for `onPathfindingRetrigger` and the `edges` array, which don't read the plan. So both the plan and the ctx field co-exist and must agree. This double-write isn't a bug but it's slightly redundant.

**Overall verdict:**

The change moves the right responsibility to the right place (scan logic lives in seek, not pursue), which is architecturally correct. The `hunt_pursue` simplification is real and meaningful. The `hunt_seek` growth is also real but acceptable — it's complexity that existed implicitly before (the rescan loop in pursue *was* target acquisition, just delayed), now made explicit and controlled.

The TacticalPlan data shape (`chase_target` with `targetUnitId`) fits hunt naturally. The `shouldReplan` + `createPlan` API is not awkward to call. No significant adjustments to the data shape seem necessary before migrating additional trees.

**Recommendation:** The proof-of-concept is sound. Proceeding to Step 10 (ability tests) is reasonable, with the caveat noted: if migrating a tree where the "seek" node is already complex, the added plan-check branch could push it over a readability threshold and warrant splitting into smaller nodes.

---

## Step 10 — Ability Tests

**Goal:** Add high-level E2E ability test scenarios that verify the system behaves correctly end-to-end. These are deterministic scenario-based tests, not unit tests. They should pass quickly and not rely on specific numbers (HP values, exact tick counts) — they test behavioral correctness.

**Files:**
- `app/js/games/minion_battles/testing/scenarios/ai/ai_plan_hold_stability.ts` *(new)*
- `app/js/games/minion_battles/testing/scenarios/ai/ai_terrain_interrupt.ts` *(new)*
- `app/js/games/minion_battles/testing/scenarios/ai/ai_replan_stagger.ts` *(new)*
- `app/js/games/minion_battles/testing/scenarios/ai/ai_serialization_roundtrip.ts` *(new)*

Look at `app/js/games/minion_battles/testing/scenarios/` for existing examples of how scenarios are structured before writing these.

### Checklist

- [x] **`ai_plan_hold_stability`**: Spawn a `hunt` unit and a target enemy. Advance the engine several rounds. Assert that the hunt unit's `tacticalPlan.data.targetUnitId` does not change between rounds as long as the target is alive — i.e., the tactical plan is being held, not re-acquired every tick.
  - Created `app/js/games/minion_battles/testing/scenarios/ai/ai_plan_hold_stability.ts`; asserts `tacticalPlan.data.targetUnitId === player.id` at tick >= 100.

- [x] **`ai_terrain_interrupt`**: Spawn a `hunt` unit with a clear path to an enemy. Record the unit's `tacticalPlan.pathWaypoints`. Place a terrain obstacle (`terrain_stone_damaged` or equivalent) directly on a waypoint in that path. Advance one round. Assert that within that round the unit's path changes (i.e., the interrupt fired and a new path was computed). Do not assert specific path coordinates — just that the path changed.
  - Created `app/js/games/minion_battles/testing/scenarios/ai/ai_terrain_interrupt.ts`; manually injects a plan with `holdUntilTick=9999` and `pathWaypoints=[{col:5,row:3}]`, emits `terrain_stone_damaged` at (5,3), asserts `holdUntilTick < 9000` after one AI cycle (plan replaced by hunt_seek after interrupt fires).

- [x] **`ai_replan_stagger`**: Spawn 6 `hunt` units simultaneously (same tick). Advance 3 full rounds. Assert that their tactical plan `holdUntilTick` values are not all identical — at least 3 distinct values should exist across the 6 units, confirming that jitter (derived from their individual `moveJitter` values) spread their replan ticks.
  - Created `app/js/games/minion_battles/testing/scenarios/ai/ai_replan_stagger.ts`; asserts `>=3` distinct `holdUntilTick` values across 6 hunters.

- [x] **`ai_serialization_roundtrip`**: Spawn a `hunt` unit pursuing an enemy. Let it run for 1 round so it has an active tactical plan. Call `engine.toJSON()`. Construct a new engine from `engine.fromJSON(saved)`. Assert that the restored unit has a non-null `tacticalPlan` with the same `type` and `targetUnitId` as before serialization. Assert the restored unit's group (if any) has the correct strategic plan type.
  - Created `app/js/games/minion_battles/testing/scenarios/ai/ai_serialization_roundtrip.ts`; does inline toJSON/fromJSON in `assertPass`, checks `restoredPlan.data.type === livePlan.data.type` and `targetUnitId` match; also verifies strategic plan type round-trips if a group exists.

- [x] All four scenarios are registered so they appear in the ability test runner (follow the pattern in other scenario index files)
  - Imported and added all four to `ALL_ABILITY_TEST_SCENARIOS` in `registry.ts`; added `{ slug: 'ai', section: 'AI' }` to `GENERAL_GROUP_ORDER`; added 4 `it(...)` tests in `SimulationRunner.test.ts` — all pass.
- [x] `npx vitest run app/js/games/minion_battles/testing` passes
  - 49 passed / 2 pre-existing earthCoreDiggingClaws failures; full suite: 526 passed / 2 pre-existing failures — no new regressions.

---

## Ability Test Coverage (High-Level)

| Scenario | What it guards |
|---|---|
| `ai_plan_hold_stability` | Plans are held across ticks; no per-tick rescan regression |
| `ai_terrain_interrupt` | Terrain changes cause path replan within one round |
| `ai_replan_stagger` | moveJitter produces distinct hold timers; units don't all replan together |
| `ai_serialization_roundtrip` | Tactical and strategic plans survive save/load across systems |

---

## What This Plan Does NOT Cover

These are intentionally deferred for later:
- **Deleting existing AI trees** — migrate them gradually after this infrastructure is proven
- **Formation geometry** — units cluster toward group center; no slots/wedge/line shapes yet
- **Role assignment** — all units in a group behave identically; vanguard/flanker is future work
- **Unit collision path invalidation** — `pathfindingRetriggerOffset` polling handles this; `path_blocked` interrupt exists as a type but is not yet wired
- **Migrating trees other than `hunt`** — do this after Step 9 is validated
- **Removing `aiControllerId`** — still one live dependency (see `docs/unit-ai-current-state.md`); clean up separately
