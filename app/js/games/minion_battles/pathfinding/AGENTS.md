# Pathfinding

Turns walk goals (unit chase targets or cell/pixel destinations) into sparse waypoint paths. Runs once per tick in the UnitManager phase between occupancy and movement, with a per-tick budget to keep frame time bounded. All scheduling and caching state lives on the unit or the terrain manager (for determinism under checkpoint restore).

| File | Owns |
|---|---|
| `NavGrid.ts` | Per-profile (default / enemy) passability grid and integer step costs; dirty-cell flush; 8-connected component labels for reachability. |
| `navProfile.ts` | `NavProfileId` enum and `getNavProfileForUnit()` to choose the profile for a unit. |
| `lineOfWalk.ts` | Exact cell-by-cell grid traversal using Amanatides-Woo DDA; validates walkable lines; `NAV_AGENT_HALF_WIDTH` for agent-sized corridors. |
| `search/BinaryHeap.ts` | Allocation-free priority queue for A* (external key array, position map, no per-op malloc). |
| `search/aStar.ts` | Point-to-point search (cell-index grid, integer costs, octile heuristic, deterministic tie-breaking by side). |
| `search/GoalField.ts` | Lazy, resumable goal-rooted Dijkstra for chasers; expansions pause until needed (LRU cached). |
| `smoothing.ts` | String-pull a cell chain into sparse waypoints; guards against expensive terrain; corner widening by per-unit lane. |
| `PathQuery.ts` | Facade over search/smoothing (`terrainManager.pathQuery`): `findPath` (A*), `findPathToSharedGoal` (GoalField), memoized `findCellPath` for explicit/UI paths, `isReachable`, direct line-of-walk fast path. |
| `PathfindingManager.ts` | Per-tick entry point: validates existing paths, schedules re-plans under budget, manages chase re-goal and path trimming. |

## Tick Placement

`PathfindingManager.tick(units, engine)` runs in `UnitManager.gameTick` between Phase 2a (occupancy) and Phase 2b (movement), measured under the `PERF_UNITS_PATHFINDING` label. No other subsystem calls pathfinding. Movement never initiates searches.

## Data Flow

1. **AI nodes / orders** set `unit.walkIntent`: AI and pet commands through `unit.setWalkGoal(...)` (AI nodes via `context.nav` in `game/units/unitAI/aiNav.ts`), player orders through `unit.setMovement(path, ...)` with an explicit path.
2. **PathfindingManager.tick** validates existing paths, plans missing/invalidated ones under the budget, and writes `unit.movement.path` (sparse waypoints, goal last). It never calls `setMovement` (that would rebuild `walkIntent`).
3. **Movement tick** (`game/units/unitMovementTick.ts`) follows the path: walks straight at each waypoint, slides diagonally round full cells (`unitCellSlide.ts`), applies the per-unit in-cell offset.

## Core Separation

- **Pathfinding never moves a unit.** It only turns goals into paths.
- **Movement never searches.** It only follows waypoints (a slide inserts a detour waypoint and marks the path for re-validation with `navEpoch = -1`).
- **AI never sees paths.** Nodes state goals; "still on its way?" is `context.nav.isWalking(unit)`.

## Determinism Rule

The sim is deterministic lockstep and clients restore from checkpoints with **empty caches**. Therefore:

- Every path must be a pure function of serialized state: terrain, special tiles, unit position, walk goal, `moveJitter`, `gameTick`, `navEpoch`.
- Caches may only **memoize** — a cache hit and a cold rebuild must return identical results.
- No wall-clock budgets, no `Math.random`, no hidden runtime queues. Scheduling state lives on the unit and is serialized.
- Use **integer costs** (cardinal `10 × weight`, diagonal `14 × weight`, rounded) and break heap ties by `(cost, cellIndex)`.
- Never pick a search strategy based on cache contents or request counts. Strategy is chosen from the goal kind only: **chase-unit goals use GoalField; cell/pixel goals use A\***.

## Terrain Changes

1. Anything that changes passability or cost calls `terrainManager.notifyNavChanged(col?, row?)`: rock created/destroyed in `TerrainManager`, crystals added/removed in `SpecialTileManager`. That bumps `navEpoch` (serialized in checkpoints) and marks the NavGrid dirty; `terrainManager.nav` flushes lazily.
2. Next tick, every path stamped with an older epoch is checked with `hasLineOfWalk(..., halfWidth 0)` along its remaining segments:
   - **blocked** ⇒ dropped and re-planned this tick, even past the budget;
   - **clear, managed** ⇒ keeps walking, re-planned under the budget (a shorter route may have opened);
   - **clear, explicit path or slide detour (`-1`)** ⇒ only re-stamped.
3. Caches (`PathQuery` memo, GoalField LRU) are keyed by epoch and dropped when it changes.

## Managed vs Explicit Paths

**Managed intents** (`walkIntent.managed === true`, set by `setWalkGoal`): the manager owns the path.
- Chase goals follow the target: re-goal when it has moved `>= max(1, floor(distanceCells / CHASE_GOAL_SLACK_DIVISOR))` cells, so far chasers keep sharing one GoalField.
- When `nextRepathTick` comes due, leading waypoints are trimmed if a later one is walkable directly.
- Re-planned when terrain changes (see above).

**Explicit paths** (player orders via `setMovement`): kept as given (player waypoints are deliberate), validated when terrain changes, re-planned to `walkIntent.dest` only when blocked or lost (e.g. after knockback). Player-controlled units still get chase re-goal when pursuing a unit.

## Spreading Mechanisms

Units with different `moveJitter` (0..1) values spread naturally:

1. **Tie-breaking (A\* and GoalField)**: side parameter (0 or 1) chooses opposite neighbor order for equal-cost cells. Derived from `moveJitter < 0.5 ? 0 : 1`.
2. **Corner widening**: during smoothing, interior waypoints can shift outward (away from the corner obstacle) by up to `floor(moveJitter * (freeCellsOutward + 1))` cells (max `CORNER_WIDEN_MAX_CELLS`). Shifts are accepted only if line of walk is maintained.
3. **In-cell offset**: the movement tick aims each waypoint at the cell centre offset by `0.15 × CELL_SIZE` at angle `moveJitter × 2π` (deterministic), so units sharing a cell stand on different pixels.

## Constants

| Constant | Value | File | Notes |
|---|---|---|---|
| `MAX_PLANS_PER_TICK` | 24 | PathfindingManager.ts | Count-based budget; unserved units stay due. |
| `CHASE_REPATH_BASE_TICKS` | 12 | PathfindingManager.ts | Base ticks to the next trim / unreachable-goal retry. |
| `CHASE_REPATH_JITTER_TICKS` | 12 | PathfindingManager.ts | Jitter range: `base + floor(moveJitter × jitter)`. |
| `CHASE_GOAL_SLACK_DIVISOR` | 8 | PathfindingManager.ts | Re-goal when target moved ≥ `max(1, floor(distance / 8))` cells. |
| `GOAL_FIELD_CACHE_SIZE` | 16 | PathQuery.ts | LRU cache size for shared goal fields. |
| `ROUTE_TIE_EPSILON` | 4 | GoalField.ts | Cost units (~0.4 cell) within which side bias may choose. |
| `CORNER_WIDEN_MAX_CELLS` | 2 | smoothing.ts | Maximum outward shift per corner waypoint. |
| `NAV_AGENT_HALF_WIDTH` | 8 | lineOfWalk.ts | Half-width (px) of corridor needed for a unit; guards against corner scrapes. |

## Measured cost (2026-10-02)

`path_stress_200` (200 chasers, 2 targets, 60×40 map with walls), perf tracker, 600 ticks: pathfinding **0.19 ms/tick** average, **≤ 1.0 ms** worst tick after start-up; the start-up burst (24 plans/tick until everyone has a path) costs ≈ 2–2.5 ms per tick, plus one cold-start tick (~33 ms) on the first planning tick. If tuning is needed, lower `MAX_PLANS_PER_TICK` first.
