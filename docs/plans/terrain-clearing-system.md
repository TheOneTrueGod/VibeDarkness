# Plan: Terrain clearing system (Rock Slide / Stone Tomb clear ground effects)

## Context

Rock Slide should erase ground effects (bramble, thorns, …) from the tiles it slides through, and Stone Tomb from the tiles it strikes. This must be built as a reusable engine system, not one-off code: future wind abilities will clear the **air** layer, explosions will clear **both**, and future projectiles will not be grid-aligned.

**Today:**

- Ground/air effects are `TerrainEffectRecord`s in `game/TerrainLayerManager.ts`. A record has a `layer`, an `area` (`cell` / `cells` / `circle`), an owner and a team. Each cell has one owning record per layer (newest wins). Overlapping records are kept so an older effect shows through when a newer one expires; that behaviour stays.
- The only removal is whole-record `remove(id)`. There is no "clear whatever is on these cells". `remove` rescans every record for each vacated cell (O(records × cells)).
- Live placers (`abilities/passiveRunner.ts` `place_terrain`, `abilities/targetHelpers.ts` bramble circle) create one `cell` record per tile, but the model allows multi-cell records, so clearing must carve single cells out of a record.
- `game/GameRenderer/renderers/TerrainEffectRenderer.ts` builds a record's sprites once and caches them by `id`, so a record that shrinks in place would keep stale sprites.
- Projectiles compose behaviour from properties (`hitPolicy`, travel modifiers in `game/projectiles/ProjectileTravelModifiers.ts`), and `ProjectileLaunchBehaviour` forwards them (`withHitPolicy`, `withModifiers`).
- Performance timings use `tickPerformanceTracker.measure([...path], fn)` (`game/performance/tickPerformanceTracker.ts`), gated by the Debug Console "JS performance tracking" toggle (`app/js/debug/debugSettingsStore.ts`).

### User decisions (binding)

1. **Width:** projectiles clear using their width (default: the projectile's radius), so non-grid-aligned projectiles work.
2. **Team filter:** `TerrainClearSpec` supports a team filter. Rock Slide and Stone Tomb do **not** use it: they clear every ground effect regardless of team.
3. **Rock rule:** whenever rock is raised on a tile (`TerrainManager.createOrMarkRock`), that tile's ground effects are cleared (`scour`).
4. **Clear-resistant flag:** add a gameplay effect-definition registry with `clearResistant`, honoured by clearing. Nothing sets it yet.
5. **Stone Tomb:** clears the ground layer on every tile it affects (stage 1 centre, stage 2 outer tiles).
6. **Reverse index:** `TerrainLayerManager` keeps a cell → covering-record-ids index per layer, so "all effects on a cell" is O(1) and `remove`'s reclaim stops scanning every record.
7. **Performance tracking:** terrain clearing is timed in the performance tracker, behind a **log level flag** so the detailed timing can be switched off later without removing the instrumentation.

---

## Agent Instructions

This plan is executed by `/jp-implement-plan` — read `.claude/skills/jp-implement-plan/SKILL.md` and follow it; do not restate or improvise its workflow here.

- The **invoking agent is the sole orchestrator**. It spawns **one worker per step, synchronously** (never `run_in_background`), waits for each to finish, verifies the plan file, and reports plan completion to the user at the end.
- Each **worker implements exactly one step**. It checks off each `- [ ]` item with a one-line summary of what actually changed, then **stops without spawning the next agent**.
- **Read every file in an item's "Touches" line before editing.** Do not guess signatures.
- **Per-step verification (keep it cheap):** `npm run lint`; `npx tsc --noEmit` when the step changes an interface or type; and **only the test files the step lists**. Never run the full suite, whole directories, `SimulationRunner.test.ts`, or E2E inside a regular step. Step 8 does that once.
- **Behaviour must stay the same unless an item says otherwise.** Existing effect placement, expiry, reclaim-on-expiry (an older overlapping effect shows through), thorn enter/land damage, DoT, deployables and save/load must be unchanged.
- **Pause and ask** (return the question as your final output) if a design point conflicts with existing engine behaviour.
- **Bash note:** on this machine the Bash tool can lose its PATH, and heredocs containing apostrophes fail to parse. Prefer Read/Edit/Write, and PowerShell for `git`/`npm`/`npx`.
- **Relevant project skills:** `game-engine`, `game-object-def-pattern`, `working-on-minion-battles`, `creating-an-ability`, `editing-card-behaviour`, `ability-tests`, `scoped-testing`, `performance-debugging`, `writing-nested-agents-files` (Step 7).
- **Folder docs:** `app/js/games/minion_battles/abilities/AGENTS.md`, `card_defs/05_earth_core/EarthCore.md`.

All paths below are relative to `app/js/games/minion_battles/` unless they start with `app/`, `docs/` or `.claude/`.

---

## Key Architecture Facts

| Fact | Where |
|---|---|
| Effect records, per-layer cell ownership, `add`/`remove`/`cleanupExpired`, `rasterizeArea`, `effectCoversCell` | `game/TerrainLayerManager.ts` |
| Save/load of effects (`toEffectsJSON` / `fromJSON` re-`add`s records) | same file; called from `game/GameEngine.ts` `toJSON` (~L2025) / `fromJSON` (~L2199) |
| Owner fingerprint folds effects by id/owner/team | `game/GameEngine.ts` ~L602 |
| Effect visuals keyed by record id | `game/GameRenderer/renderers/TerrainEffectRenderer.ts`, visual defs in `game/GameRenderer/terrainEffectDefs.ts` |
| Effect types today: `bramble_slow`, `dark_thorn` (ground) | `game/terrainEffects/tileTransitions.ts`, `abilities/targetHelpers.ts`, `abilities/passiveRunner.ts` |
| Rock raised (floor layer, emits nothing) | `terrain/TerrainManager.ts` `createOrMarkRock`; stone-damaged emitter pattern `setStoneDamagedEmitter` wired in `GameEngine.prepareForNewGame` / `fromJSON` |
| Projectile movement + per-pixel wall-stop sampling | `game/projectiles/Projectile.ts` `update` / `findWallStop`; serialized in `toJSON`/`fromJSON` |
| Launch behaviour property forwarding | `abilities/CastBehaviours/ProjectileLaunchBehaviour.ts` |
| Declarative ability-event effects | `abilities/events/AbilityEffect.ts` (types) and `abilities/events/AbilityEventRuntime.ts` (execution) |
| Rock Slide projectile | `card_defs/05_earth_core/0537_RockSlide/0537Ability.ts` `rockLaunch()` |
| Stone Tomb strikes | `card_defs/05_earth_core/0530_StoneTomb/0530Ability.ts` `stageOne` / `stageTwo` |
| Tile helpers | `abilities/tileAreaHelpers.ts` (`worldToTile`, `tileCentre`, `TileCoord`) |
| Perf tracker + path constants | `game/performance/tickPerformanceTracker.ts`; toggle `jsPerformanceTracking` in `app/js/debug/debugSettingsStore.ts` |
| EventBus event map | `game/EventBus.ts` |

---

## Checklist

### Step 1 — Reverse index in `TerrainLayerManager`

- [ ] Add a per-layer reverse index: `coverage: Record<'ground' | 'air', Map<cellKey, Set<recordId>>>` listing **every** record covering each cell (not just the owner).
  - Maintain it in `add` (index every rasterized cell) and `remove` (unindex the record's cells).
  - Rewrite `remove`'s reclaim loop to pick the winner from `coverage` for each vacated cell instead of scanning `effectRegistry`. Same `effectTakesPrecedence` policy, same result.
  - `fromJSON` rebuilds it through `add` (no save-format change). The floor layer is not indexed (floor tiles are a separate map).
  - Add a public read `getEffectsCoveringCell(layer, col, row): TerrainEffectRecord[]`.
  - **Touches:** `game/TerrainLayerManager.ts`
- [ ] Add `game/TerrainLayerManager.test.ts` (or extend an existing test for this file; grep first):
  - Overlapping records on one cell: removing the newer reclaims the older (unchanged behaviour).
  - Expiry via `cleanupExpired` reclaims correctly.
  - `getEffectsCoveringCell` returns every covering record, including multi-cell and circle areas.
  - A `toEffectsJSON` → `fromJSON` round-trip gives the same ownership and coverage.
  - **Touches:** the test file; run it only

---

### Step 2 — Gameplay effect definitions and the clear-resistant flag

- [ ] Add a gameplay terrain-effect definition registry, separate from the render-only visual defs:
  - New `game/terrainEffects/terrainEffectDefs.ts`: `interface TerrainEffectDef { effectType: string; layer: 'ground' | 'air'; clearResistant?: boolean }`, `TERRAIN_EFFECT_DEFS` with entries for `bramble_slow` and `dark_thorn` (neither resistant), and `getTerrainEffectDef(effectType)`. Unknown types default to clearable.
  - Re-use the existing `BRAMBLE_SLOW_EFFECT_TYPE` / `DARK_THORN_EFFECT_TYPE` constants from `tileTransitions.ts` rather than new string literals.
  - Follow `game-object-def-pattern`: the flag lives on the type definition, not on each record.
  - **Touches:** new `game/terrainEffects/terrainEffectDefs.ts`, `game/terrainEffects/tileTransitions.ts` (import only, if needed)

---

### Step 3 — Clear specs, the carve primitive, and the engine entry point

- [ ] Add clear specs in a new `game/terrainEffects/terrainClearing.ts`:
  - `interface TerrainClearSpec { layers: ReadonlyArray<'ground' | 'air'>; effectTypes?: readonly string[]; excludeEffectTypes?: readonly string[]; teams?: { include?: readonly TeamId[]; exclude?: readonly TeamId[] } }`. Never the floor layer.
  - Presets `TERRAIN_CLEARS = { scour: { layers: ['ground'] }, gust: { layers: ['air'] }, blast: { layers: ['ground', 'air'] } }`.
  - `matchesClearSpec(record, spec)`: layer, effect-type allow/deny, team filter, and **`clearResistant` from `getTerrainEffectDef` always wins** (a resistant effect is never cleared).
  - **Touches:** new `game/terrainEffects/terrainClearing.ts`, `game/terrainEffects/terrainEffectDefs.ts`
- [ ] Add the carve primitive `TerrainLayerManager.clearCells(cells, predicate): ClearedTerrainEffect[]` (predicate = `matchesClearSpec` bound to a spec, so the manager has no dependency on specs or defs):
  - For each cell and each layer the predicate allows, take **all** covering records from the reverse index (Step 1), not just the owner, so an older effect underneath cannot reclaim the cell.
  - Single-cell records are removed (`remove`). Multi-cell records (`cells` / `circle`) are carved: convert the area to a `cells` list without that cell, keep the same `id` (owner bookkeeping and deployables still work), update the reverse index and ownership, and remove the record if no cells remain.
  - Bump an optional `revision` counter on a carved record (render-only, not serialized) so the renderer can rebuild it.
  - Return what was cleared: `{ id, effectType, layer, col, row }[]`.
  - **Touches:** `game/TerrainLayerManager.ts`
- [ ] Add the engine-level entry point in `terrainClearing.ts`: `clearTerrainEffects(ctx: { terrainLayers; eventBus }, target: TileCoord[] | TerrainEffectArea, spec, source?: { unitId?: string; abilityId?: string })`:
  - Rasterizes an area (or takes cells), calls `clearCells`, and when anything was cleared emits a new EventBus event `terrain_effects_cleared` `{ cleared: ClearedTerrainEffect[]; source }`. Add the event to `game/EventBus.ts`.
  - **Touches:** `game/terrainEffects/terrainClearing.ts`, `game/EventBus.ts`
- [ ] Make `TerrainEffectRenderer` rebuild carved records: key cached visuals by `${id}@${revision ?? 0}` so a carved record's stale sprites are dropped and rebuilt.
  - **Touches:** `game/GameRenderer/renderers/TerrainEffectRenderer.ts`
- [ ] Add `game/terrainEffects/terrainClearing.test.ts`:
  - `scour` clears ground and leaves air; `gust` the reverse; `blast` both; floor tiles are never touched.
  - Overlapping records on a cell: all matching ones are cleared, and nothing reclaims the cell.
  - Carving: a `circle` / `cells` record loses only the cleared cell, keeps its id, and is removed when empty.
  - Filters: `effectTypes`, `excludeEffectTypes`, team `include`/`exclude`; a `clearResistant` def survives even `blast`.
  - The event fires with the cleared list and source, and not when nothing was cleared.
  - Save/load after a carve keeps the carved area.
  - **Touches:** the new test file; run it plus `game/TerrainLayerManager.test.ts`

---

### Step 4 — Performance tracking with a log-level flag

- [ ] Add a log level to the tracker so detailed instrumentation can be turned off later without removing it:
  - In `tickPerformanceTracker.ts`: `type PerformanceLogLevel = 'standard' | 'verbose'`, a module constant `PERFORMANCE_LOG_LEVEL: PerformanceLogLevel` (set to `'verbose'` for now, with a doc comment saying to drop it to `'standard'` to silence verbose timings), and an optional `{ level }` argument on `measure` (default `'standard'`). A `'verbose'` measurement records only when tracking is enabled **and** `PERFORMANCE_LOG_LEVEL === 'verbose'`. Existing call sites are unchanged.
  - Add path constant `PERF_TERRAIN_CLEAR = 'terrainClear'`.
  - Grep how the tracker is unit-tested (if at all) and follow that pattern; if the level is better as a Debug Console setting next to `jsPerformanceTracking` in `debugSettingsStore.ts`, pause and ask before adding UI.
  - **Touches:** `game/performance/tickPerformanceTracker.ts`
- [ ] Wrap the body of `clearTerrainEffects` in `tickPerformanceTracker.measure([..., PERF_TERRAIN_CLEAR], fn, { level: 'verbose' })`. Nest it under the caller's category where one is active (projectile clears land under `engine.projectiles`); otherwise use the engine root.
  - Add a tracker test (or extend an existing one): a verbose measurement is recorded at `'verbose'` and skipped at `'standard'`.
  - **Touches:** `game/terrainEffects/terrainClearing.ts`, the tracker's test file; run that test only

---

### Step 5 — Path sweeping and the projectile property

- [ ] Add `cellsAlongSegment(from, to, width = 0): TileCoord[]` to `abilities/tileAreaHelpers.ts`:
  - Width 0: supercover line (every tile the centre line passes through, including both diagonal neighbours at an exact corner crossing).
  - Width > 0: every tile within `width` px of the segment (a capsule). Deterministic order, no duplicates.
  - Tests in the existing tile helpers test file (grep for it; create `abilities/tileAreaHelpers.test.ts` if none): cardinal, diagonal, corner crossing, zero-length segment, and widths 0 / 18 / 40.
  - **Touches:** `abilities/tileAreaHelpers.ts`, its test file; run that test only
- [ ] Add the projectile property `clearsTerrainEffects?: { spec: TerrainClearSpec; sweepWidth?: number }` to `Projectile` (constructor option, field, `toJSON`/`fromJSON`):
  - In `update`, after movement and the wall stop, clear `cellsAlongSegment(prev, final, sweepWidth ?? this.radius)` via `clearTerrainEffects`, with source `{ unitId: sourceUnitId, abilityId: sourceAbilityId }`.
  - To keep per-tick work small, skip cells already cleared by this projectile this flight (a `clearedTerrainCells` set, serialized like `hitUnitIds`).
  - A held projectile clears nothing until released. Max-distance expiry still clears the final partial segment.
  - Tests in `game/projectiles/Projectile.test.ts`: clears only cells within width of its path; a narrow vs wide sweep on an off-grid diagonal; nothing while held; a JSON round-trip keeps the property and the cleared set.
  - **Touches:** `game/projectiles/Projectile.ts`, `game/projectiles/Projectile.test.ts`; run that test only
- [ ] Add `ProjectileLaunchBehaviour.withTerrainClear(spec, opts?: { sweepWidth?: number })`, forwarding to the projectile like `withHitPolicy`.
  - Extend `abilities/CastBehaviours/behaviours.test.ts`: the launched (and held, then released) projectile carries the property.
  - **Touches:** `abilities/CastBehaviours/ProjectileLaunchBehaviour.ts`, `abilities/CastBehaviours/behaviours.test.ts`; run that test only

---

### Step 6 — Systemic hooks, declarative effect, and the two abilities

- [ ] **Rock rule:** raising rock clears that tile's ground effects.
  - `TerrainManager.createOrMarkRock` calls the carve with `TERRAIN_CLEARS.scour` for that cell after the rock is placed, through an emitter hook so the event still reaches the EventBus. Mirror the existing `setStoneDamagedEmitter` pattern: e.g. `setTerrainEffectsClearedEmitter`, wired in `GameEngine.prepareForNewGame` and `GameEngine.fromJSON` next to the stone-damaged emitter. Read both wiring sites first.
  - Tests in `terrain/TerrainManager.rock.test.ts`: a bramble on the tile is gone after `createOrMarkRock`; a neighbouring bramble stays; the emitter fires.
  - **Touches:** `terrain/TerrainManager.ts`, `game/GameEngine.ts`, `terrain/TerrainManager.rock.test.ts`; run that test only
- [ ] **Declarative effect:** add an ability-event effect `{ type: 'clearTerrainEffects'; clear: keyof typeof TERRAIN_CLEARS | TerrainClearSpec; radiusPx: number; at?: 'primaryTarget' | 'caster' }` that clears a circle, for future explosion and wind abilities.
  - Read how an existing effect with an area is declared and executed in `AbilityEffect.ts` / `AbilityEventRuntime.ts` before adding it. Add one runtime test next to the existing `AbilityEventRuntime` tests.
  - **Touches:** `abilities/events/AbilityEffect.ts`, `abilities/events/AbilityEventRuntime.ts`, `abilities/events/AbilityEventRuntime.test.ts`; run that test only
- [ ] **Rock Slide:** `rockLaunch()` adds `.withTerrainClear(TERRAIN_CLEARS.scour)` (sweep width = projectile radius; no team filter).
  - Add a case to `0537Ability.test.ts`: bramble on the spawn tile and on 2 tiles along the path, and 1 tile beside the path; after the flight the path tiles are clear and the side tile keeps its bramble.
  - **Touches:** `card_defs/05_earth_core/0537_RockSlide/0537Ability.ts`, `0537Ability.test.ts`; run that test only
- [ ] **Stone Tomb:** `stageOne` clears the centre tile and `stageTwo` the four outer tiles with `TERRAIN_CLEARS.scour` via `clearTerrainEffects` (no team filter), with source `{ unitId: caster.id, abilityId: '0530' }`. The centre is also covered by the rock rule; keep the explicit clear so the ability's behaviour does not depend on the hook.
  - Extend `0530Ability.test.ts` (its stub engine needs a real `TerrainLayerManager` and `eventBus`): ground effects on the plus are cleared at the right stage; an air effect on a plus tile survives.
  - **Touches:** `card_defs/05_earth_core/0530_StoneTomb/0530Ability.ts`, `0530Ability.test.ts`; run that test only

---

### Step 7 — AbilityTest scenarios and docs

Create the scenarios here but **do not run `SimulationRunner.test.ts` in this step** (Step 8 does).

- [ ] Add to `testing/scenarios/abilities/earthCoreScenarios.ts`, register in `testing/scenarios/registry.ts` (both lists the Earth scenarios appear in), and add `it(...)` entries in `testing/runner/SimulationRunner.test.ts`:
  - `earthCoreRockSlideScoursGroundScenario`: bramble (ground) on several tiles of the rock's path and on one tile beside it, plus one air effect on a path tile. Pass when the path tiles have no ground effect, the side tile still has its bramble, the air effect remains, and the rock landed. Covers the projectile sweep, the `scour` preset and layer filtering.
  - `earthCoreStoneTombScoursGroundScenario`: thorns (ground) on all five plus tiles and on one tile outside the plus. Pass when no plus tile has a ground effect, the outside tile keeps its thorns, and the centre is Rock. Covers the ability clear and the rock rule.
  - Place effects with `engine.terrainLayers.add` (see `deployableScenarios.ts` for the record shape). Structural assertions only, deterministic, no RNG.
  - **Touches:** listed files
- [ ] Update the docs:
  - `abilities/AGENTS.md`: a short **Terrain clearing** section covering specs and presets, `clearTerrainEffects`, the projectile `withTerrainClear` property and sweep width, the declarative effect, the rock rule, `clearResistant`, the `terrain_effects_cleared` event, and the verbose perf flag.
  - `card_defs/05_earth_core/EarthCore.md`: Rock Slide and Stone Tomb scour the ground layer.
  - Follow `writing-nested-agents-files`.
  - **Touches:** listed docs

---

### Step 8 — Final verification (run the expensive things once)

- [ ] `npm run lint` and `npx tsc --noEmit` — zero errors.
- [ ] Run `npx vitest run app/js/games/minion_battles/testing/runner/SimulationRunner.test.ts`. All scenarios must pass, especially the two new ones, every Earth scenario, the bramble/thorn and deployable scenarios, and lanternites. Record pre-existing failures separately, confirmed against `HEAD` (e.g. in a separate worktree).
- [ ] Run the broad suite once: `npm run test`. Fix new failures, or record each with a justification and how it was confirmed pre-existing.
- [ ] Write a manual browser checklist into this plan for the user. Do not attempt it unless a browser tool is available and the user asked.
  - Rock Slide through a bramble patch: the scoured tiles' bramble sprites disappear as the rock passes; tiles beside the path keep theirs.
  - Stone Tomb on thorns: the plus is cleared at each stage; the centre shows rock.
  - A multi-tile effect partly cleared redraws without the cleared tiles (no stale sprites).
  - Debug Console → JS performance tracking on: `terrainClear` appears in the Performance tab under projectiles while Rock Slide flies; with `PERFORMANCE_LOG_LEVEL` set to `'standard'` it no longer appears.

---

## AbilityTest philosophy for this plan

- **Two scenarios, high level:** Rock Slide scouring its path (projectile sweep and layer filtering) and Stone Tomb scouring its plus (ability clear and the rock rule). Carving, filters, the resistant flag, save/load and perf gating are covered by fast unit tests.
- Structural assertions only (effect present or absent per tile, terrain type), deterministic positions, no RNG.

## Out of scope

- Any ability that actually uses `gust`, `blast`, `clearResistant` or the declarative clear effect (only the building blocks ship here).
- Dash/lunge sweeps (e.g. Digging Claws clearing its path); `cellsAlongSegment` makes this a small follow-up.
- VFX for cleared tiles (the `terrain_effects_cleared` event is the hook for it).
- Restructuring `TerrainLayerManager` to a single effect per cell.

## File Reference Map

| File | Steps |
|---|---|
| `game/TerrainLayerManager.ts` (+ test) | 1, 3 |
| `game/terrainEffects/terrainEffectDefs.ts` (new) | 2, 3 |
| `game/terrainEffects/terrainClearing.ts` (new, + test) | 3, 4 |
| `game/EventBus.ts` | 3 |
| `game/GameRenderer/renderers/TerrainEffectRenderer.ts` | 3 |
| `game/performance/tickPerformanceTracker.ts` | 4 |
| `abilities/tileAreaHelpers.ts` (+ test) | 5 |
| `game/projectiles/Projectile.ts` (+ test) | 5 |
| `abilities/CastBehaviours/ProjectileLaunchBehaviour.ts`, `behaviours.test.ts` | 5 |
| `terrain/TerrainManager.ts`, `game/GameEngine.ts`, `TerrainManager.rock.test.ts` | 6 |
| `abilities/events/AbilityEffect.ts`, `AbilityEventRuntime.ts` (+ test) | 6 |
| `card_defs/05_earth_core/0537_RockSlide/*`, `0530_StoneTomb/*` | 6 |
| `testing/scenarios/*`, `testing/runner/SimulationRunner.test.ts` | 7, 8 |
| `abilities/AGENTS.md`, `card_defs/05_earth_core/EarthCore.md` | 7 |
