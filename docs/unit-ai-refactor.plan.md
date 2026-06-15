# Unit AI Refactor — Hierarchical Blackboard + Lazy Plans

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

- [ ] Create `plans/types.ts` exporting:
  - `InterruptFlag` union type: `'target_died' | 'terrain_changed_near_path' | 'path_blocked' | 'took_significant_damage' | 'enemy_entered_proximity' | 'group_dispersed' | 'objective_complete' | 'objective_invalidated'`
  - `Plan<T>` interface: `{ data: T; holdUntilTick: number; invalidateOn: ReadonlySet<InterruptFlag>; pathWaypoints?: {col:number;row:number}[] }`
  - `StrategicPlan` interface: `{ type: 'advance'|'defend'|'construct'|'hunt'|'idle'; destinationPOIId?: string; destinationLabel?: string; engagePolicy: 'opportunistic'|'aggressive'|'ignore'|'flee'; priority: number }`
  - `TacticalPlan` interface: `{ type: 'move_to_waypoint'|'hold_position'|'chase_target'|'return_to_group'|'idle'; waypointGrid?: {col:number;row:number}; targetUnitId?: string; groupCohesionCenter?: {x:number;y:number} }`
  - `ImmediateDecision` interface: `{ type: 'use_ability'|'move_along_path'|'wait'; abilityId?: string; targetId?: string; path?: {col:number;row:number}[] }` — note in a JSDoc comment that this type is **never serialized**
  - `SerializedTacticalPlan` interface for JSON: same fields as TacticalPlan plus `ticksRemaining: number` (relative, not absolute tick); no path field
- [ ] Create `plans/planUtils.ts` exporting:
  - `createPlan<T>(data, opts: { baseTicks, moveJitter, maxJitterTicks, invalidateOn, currentTick, path? }): Plan<T>` — `holdUntilTick = currentTick + baseTicks + Math.floor(moveJitter * maxJitterTicks)`
  - `shouldReplan<T>(plan: Plan<T> | null, currentTick: number, pendingInterrupts: ReadonlySet<InterruptFlag>): boolean` — returns true if null, timer expired, or any pending interrupt matches invalidateOn
  - `serializeTacticalPlan(plan: Plan<TacticalPlan>, currentTick: number): SerializedTacticalPlan` — converts to relative ticks, omits path
  - `deserializeTacticalPlan(serialized: SerializedTacticalPlan, currentTick: number): Plan<TacticalPlan>` — reconstructs with `holdUntilTick = currentTick + ticksRemaining`, empty invalidateOn set (caller must supply), no pathWaypoints
- [ ] TypeScript compiles with no errors in these two files

---

## Step 2 — moveJitter Consolidation

**Goal:** Make `moveJitter` the single source of timing variation. Derive `pathfindingRetriggerOffset` from it instead of a separate RNG call. Update the JSDoc to document moveJitter as the timing seed.

**Files:**
- `app/js/games/minion_battles/game/managers/UnitManager.ts` *(modify)*
- `app/js/games/minion_battles/game/units/Unit.ts` *(modify JSDoc only)*

### Checklist

- [ ] In `UnitManager.addUnit()`, replace the two separate random calls with a single `moveJitter` call and derive the retrigger offset from it:
  ```typescript
  unit.moveJitter = this.ctx.generateRandomInteger(0, 1000) / 1000;
  unit.pathfindingRetriggerOffset = 30 + Math.floor(unit.moveJitter * 60);
  ```
  (Previously `pathfindingRetriggerOffset` was set via its own `generateRandomInteger(30, 90)` call.)
- [ ] Update the JSDoc on `Unit.moveJitter` to read: *"Per-unit timing and directional seed in [0, 1]. Set once at spawn, never changed. Use as the base for any jitter-like mechanic — timing offsets, phase spreads, angle variation."*
- [ ] Verify existing tests still pass: `npx vitest run app/js/games/minion_battles/game/units/unitAI/DefaultAITree.test.ts`

---

## Step 3 — Unit Fields for Tactical Plan and Pending Interrupts

**Goal:** Add the two runtime fields the new system needs onto `Unit`. `tacticalPlan` is serialized; `pendingInterrupts` is ephemeral and never serialized.

**Files:**
- `app/js/games/minion_battles/game/units/Unit.ts` *(modify)*

### Checklist

- [ ] Add import for `Plan`, `TacticalPlan`, `InterruptFlag`, `SerializedTacticalPlan`, `serializeTacticalPlan`, `deserializeTacticalPlan` from `unitAI/plans/types` and `unitAI/plans/planUtils`
- [ ] Add field: `tacticalPlan: Plan<TacticalPlan> | null = null` with JSDoc: *"Current medium-term AI goal. Serialized as relative ticks. Null means unit should replan on next tactical tick."*
- [ ] Add field: `pendingInterrupts: Set<InterruptFlag> = new Set()` with JSDoc: *"Events queued since last AI tick that may invalidate current plans. Cleared at the end of each AI decision. Not serialized."*
- [ ] In `Unit.toJSON()`, add serialization of `tacticalPlan`:
  ```typescript
  tacticalPlan: this.tacticalPlan
    ? serializeTacticalPlan(this.tacticalPlan, currentGameTick)
    : null,
  ```
  Note: `Unit.toJSON()` will need `currentGameTick` passed in, or the serialization should be done at the call site (check how other time-relative fields are handled and be consistent)
- [ ] In `Unit.fromJSON()`, add deserialization of `tacticalPlan`:
  ```typescript
  if (data.tacticalPlan) {
    unit.tacticalPlan = deserializeTacticalPlan(
      data.tacticalPlan as SerializedTacticalPlan,
      currentGameTick,
    );
  }
  ```
- [ ] `pendingInterrupts` is NOT included in `toJSON` output
- [ ] TypeScript compiles; existing unit tests pass

---

## Step 4 — Interrupt System

**Goal:** A lightweight subscriber that listens to the engine EventBus and marks `pendingInterrupts` on affected units. Also handles terrain-change path proximity checking.

**Files:**
- `app/js/games/minion_battles/game/units/unitAI/plans/InterruptSystem.ts` *(new)*

### Checklist

- [ ] Create `InterruptSystem` class with:
  - Constructor takes `getUnits: () => Unit[]`
  - `registerListeners(eventBus: EventBus): void` — subscribes to events (call once from GameEngine)
  - `clearAllInterrupts(): void` — clears `pendingInterrupts` on every unit (called after AI phase each tick)
- [ ] Subscribe to `unit_died` event: mark `target_died` on any unit whose `tacticalPlan?.data.targetUnitId === deadUnitId` or whose `aiContext.targetUnitId === deadUnitId`
- [ ] Subscribe to `terrain_stone_damaged` event (or equivalent terrain-change event — check EventBus for the real event name): for each unit with a `tacticalPlan` that has `pathWaypoints`, check if any waypoint is within `TERRAIN_INTERRUPT_RADIUS = 2` tiles (Chebyshev distance) of the changed cell; if so mark `terrain_changed_near_path`
- [ ] Subscribe to `damage_taken` event: if damage exceeds `SIGNIFICANT_DAMAGE_THRESHOLD` (e.g. 20% of unit's maxHp in a single hit), mark `took_significant_damage` on the damaged unit
- [ ] Export a `TERRAIN_INTERRUPT_RADIUS` constant (value 2) for use in tests
- [ ] TypeScript compiles

---

## Step 5 — Group Infrastructure

**Goal:** Introduce groups as a first-class concept. `GroupManager` owns `GroupBlackboard` records and runs the group brain on a staggered schedule. No actual brain logic yet — just the data layer and scheduling skeleton.

**Files:**
- `app/js/games/minion_battles/game/units/unitAI/groups/types.ts` *(new)*
- `app/js/games/minion_battles/game/units/unitAI/groups/GroupManager.ts` *(new)*

### Checklist

- [ ] Create `groups/types.ts` exporting:
  - `GroupBlackboard` interface:
    ```typescript
    interface GroupBlackboard {
      groupId: string;
      unitIds: string[];
      strategicPlan: Plan<StrategicPlan>;
      // Ephemeral outputs written by group brain (not serialized):
      formationCenter?: { x: number; y: number };
      advanceWaypoint?: { col: number; row: number };
      sharedTargetId?: string;
      nextBrainTick: number;
    }
    ```
  - `groupJitter(groupId: string): number` — stable hash of groupId string reduced to [0, 1); same semantic role as `unit.moveJitter` but for groups. Implementation: sum char codes, modulo a prime, divide by prime.
  - `SerializedGroup` interface for JSON:
    ```typescript
    interface SerializedGroup {
      groupId: string;
      unitIds: string[];
      strategicPlan: {
        type: string;
        destinationPOIId?: string;
        destinationLabel?: string;
        engagePolicy: string;
        priority: number;
        ticksRemaining: number;   // relative
      };
      brainTicksRemaining: number;  // relative
    }
    ```
- [ ] Create `groups/GroupManager.ts` exporting `GroupManager` class:
  - `groups: Map<string, GroupBlackboard>` (private)
  - `createGroup(groupId: string, unitIds: string[], plan: Plan<StrategicPlan>): GroupBlackboard`
  - `getGroup(groupId: string): GroupBlackboard | undefined`
  - `getGroupForUnit(unitId: string): GroupBlackboard | undefined` — searches all groups
  - `tick(gameTick: number, context: AIContext): void` — iterates groups, runs brain for any where `gameTick >= nextBrainTick` (brain implementation is a no-op stub for now — just reschedules)
  - `toJSON(currentGameTick: number): SerializedGroup[]`
  - `fromJSON(data: SerializedGroup[], currentGameTick: number): void` — rebuilds `groups` map; sets `formationCenter/advanceWaypoint/sharedTargetId` to undefined (group brain will repopulate on first run)
- [ ] TypeScript compiles

---

## Step 6 — Group Brain and Strategic Director

**Goal:** Implement the group brain logic that reads the strategic plan and writes computed outputs to the blackboard. Define the `StrategicDirector` interface that missions will implement.

**Files:**
- `app/js/games/minion_battles/game/units/unitAI/groups/GroupBrain.ts` *(new)*
- `app/js/games/minion_battles/game/units/unitAI/groups/StrategicDirector.ts` *(new)*

### Checklist

- [ ] Create `groups/GroupBrain.ts` exporting `runGroupBrain(blackboard: GroupBlackboard, context: AIContext): void`:
  - Compute `formationCenter`: average world position of all living units in `unitIds`
  - Compute `sharedTargetId`: find the nearest living enemy to `formationCenter` (use `findEnemies` from `unitAI/utils.ts`, no LOS requirement for group-level targeting)
  - Compute `advanceWaypoint`: if strategic plan has a `destinationPOIId`, resolve it via `context.mapPOIs` to grid coords; if `destinationLabel` is set (no POI), leave `advanceWaypoint` undefined for now (future: label-to-coord map)
  - Reschedule: `blackboard.nextBrainTick = context.gameTick + GROUP_BRAIN_BASE_TICKS + Math.floor(groupJitter(blackboard.groupId) * GROUP_BRAIN_JITTER_TICKS)` where `GROUP_BRAIN_BASE_TICKS = 20` and `GROUP_BRAIN_JITTER_TICKS = 10`
  - Wire this into `GroupManager.tick()` replacing the stub
- [ ] Create `groups/StrategicDirector.ts` exporting:
  - `StrategicDirector` interface: `{ createGroups(unitIds: string[], context: AIContext): GroupBlackboard[] }`
  - `DefaultStrategicDirector` class implementing it: creates a single group containing all provided unitIds with a `hunt` + `opportunistic` strategic plan, hold timer of 100 ticks
  - This is what a mission with no custom director gets
- [ ] TypeScript compiles

---

## Step 7 — Serialization Wiring

**Goal:** Hook `GroupManager` into the engine's save/load cycle. Extend the serialized game state type to include group state.

**Files:**
- `app/js/games/minion_battles/game/types.ts` *(modify)*
- `app/js/games/minion_battles/game/GameEngine.ts` *(modify)*

### Checklist

- [ ] In `game/types.ts`, add `groups?: SerializedGroup[]` to the serialized game state interface (the same interface that already has `aiControllerId`, `firedEventIndices`, etc.)
- [ ] In `GameEngine.toJSON()`, include `groups: this.groupManager.toJSON(this.gameTick)`
- [ ] In `GameEngine.fromJSON()`, call `this.groupManager.fromJSON(data.groups ?? [], data.gameTick ?? 0)`
- [ ] `GroupManager` instance needs to be accessible from `GameEngine` — add as a field on `GameState` (alongside other manager instances like `UnitManager`, `LevelEventManager`) or directly on `GameEngine`; follow the existing pattern for manager ownership
- [ ] Verify serialization round-trip: construct an engine, create a group, serialize, deserialize, and assert the group blackboard is restored with correct `strategicPlan.type` and approximate `nextBrainTick`
- [ ] TypeScript compiles; no regressions in existing tests

---

## Step 8 — Wire Into Game Tick

**Goal:** Connect `InterruptSystem` and `GroupManager.tick()` into the game loop. After this step, groups run their brains on schedule and interrupts are delivered to units.

**Files:**
- `app/js/games/minion_battles/game/managers/UnitManager.ts` *(modify)*
- `app/js/games/minion_battles/game/GameEngine.ts` *(modify)*

### Checklist

- [ ] `InterruptSystem` is instantiated (in `GameEngine` or `GameState`) and `registerListeners(eventBus)` is called during engine init
- [ ] In the `UnitManager.gameTick()` Phase 3 loop (AI decisions), after `runUnitAI(unit, tree, aiContext)`:
  - Clear `unit.pendingInterrupts` (`unit.pendingInterrupts.clear()`)
- [ ] Add a new phase before Phase 3 in `UnitManager.gameTick()` or in `GameEngine`'s tick orchestration: call `groupManager.tick(gameTick, aiContext)` once per game tick
- [ ] `AIContext` interface in `unitAI/types.ts` does not need changes yet — `GroupManager` is passed directly to `UnitManager` rather than through AIContext (keep AIContext minimal for now)
- [ ] Run the full test suite: `npx vitest run app/js/games/minion_battles` and confirm no regressions

---

## Step 9 — Migrate Hunt Tree

**Goal:** Update the `hunt` AI tree to read from the new tactical plan layer instead of scanning for the nearest enemy from scratch on every tick. The tree becomes a consumer of the tactical plan rather than an independent scanner. This is the proof-of-concept migration; other trees follow the same pattern later.

**Files:**
- `app/js/games/minion_battles/game/units/unitAI/hunt/hunt_seek.ts` *(modify)*
- `app/js/games/minion_battles/game/units/unitAI/hunt/hunt_pursue.ts` *(modify)*
- `app/js/games/minion_battles/game/units/unitAI/hunt/context.ts` *(modify)*

### Checklist

- [ ] In `hunt_seek.ts`: before scanning for enemies, check if `unit.tacticalPlan?.data.type === 'chase_target'` and `targetUnitId` is set and alive — if so, skip the scan and transition directly to `hunt_pursue` using the existing target. Only scan if the tactical plan is absent or stale.
- [ ] In `hunt_pursue.ts`: remove the inline rescan timer (`lastScanTime` + 0.5-round interval). Instead:
  - Use `unit.tacticalPlan?.data.targetUnitId` as the primary target
  - If that's null or dead, set `ctx.aiState = 'hunt_seek'` (tactical plan absent = needs replanning at higher layer)
  - Keep `onPathfindingRetrigger` as-is (path refreshes are still periodic)
- [ ] In `hunt/context.ts`: mark `lastScanTime` as deprecated or remove it if nothing else uses it
- [ ] The hunt tree now trusts the tactical plan for target identity; the tactical plan layer (when implemented for hunt) will handle target acquisition and hold/rescan logic
- [ ] Existing hunt tree tests still pass: `npx vitest run app/js/games/minion_battles/game/units/unitAI`

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

- [ ] **`ai_plan_hold_stability`**: Spawn a `hunt` unit and a target enemy. Advance the engine several rounds. Assert that the hunt unit's `tacticalPlan.data.targetUnitId` does not change between rounds as long as the target is alive — i.e., the tactical plan is being held, not re-acquired every tick.

- [ ] **`ai_terrain_interrupt`**: Spawn a `hunt` unit with a clear path to an enemy. Record the unit's `tacticalPlan.pathWaypoints`. Place a terrain obstacle (`terrain_stone_damaged` or equivalent) directly on a waypoint in that path. Advance one round. Assert that within that round the unit's path changes (i.e., the interrupt fired and a new path was computed). Do not assert specific path coordinates — just that the path changed.

- [ ] **`ai_replan_stagger`**: Spawn 6 `hunt` units simultaneously (same tick). Advance 3 full rounds. Assert that their tactical plan `holdUntilTick` values are not all identical — at least 3 distinct values should exist across the 6 units, confirming that jitter (derived from their individual `moveJitter` values) spread their replan ticks.

- [ ] **`ai_serialization_roundtrip`**: Spawn a `hunt` unit pursuing an enemy. Let it run for 1 round so it has an active tactical plan. Call `engine.toJSON()`. Construct a new engine from `engine.fromJSON(saved)`. Assert that the restored unit has a non-null `tacticalPlan` with the same `type` and `targetUnitId` as before serialization. Assert the restored unit's group (if any) has the correct strategic plan type.

- [ ] All four scenarios are registered so they appear in the ability test runner (follow the pattern in other scenario index files)
- [ ] `npx vitest run app/js/games/minion_battles/testing` passes

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
