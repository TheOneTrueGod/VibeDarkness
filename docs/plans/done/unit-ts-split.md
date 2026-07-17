# Plan: Split Unit.ts into Domain Modules

> **Completed 2026-07-02.** All 12 steps implemented. Unit.ts reduced from 1,929 lines to 391 lines via 16 new/modified files. Checkpoint JSON shape preserved verbatim; golden round-trip test passes. Full suite: 612 passed / 10 failed (same 10 pre-existing failures as Step 1 baseline — no regressions). Follow-up TODOs noted in docs/TODO.md if any were found during the refactor.

## Context

`game/units/Unit.ts` is 1,929 lines and owns too much: movement path-following, knockback physics, wall-unstick/slingshot, ability lifecycle, damage/stack cascade, darkness corruption, CC armour, ~30 flat fields for lanternite/thornling/swarm-nest/swarmling/pet state, and ~380 lines of toJSON/fromJSON.

**Goals:**
- Every new/modified file ≤ 200 lines; Unit.ts itself ≤ 400 lines.
- Group the unit-type-specific field blobs into typed sub-state objects (`unit.petState`, `unit.lanterniteState`, `unit.thornlingState`, `unit.swarmState`, `unit.ccArmour`) — approved by Jeremy over the lower-churn "declaration merging" alternative.
- Behaviour-preserving. **The serialized JSON checkpoint shape stays flat and identical** — state modules flatten/unflatten in their serialization helpers.
- Follow the established extraction convention: bulk logic as free functions taking `unit` as the first parameter (see `unitAbilityTick.ts`, `abilities/abilityUses.ts`, `slingshotHelpers.ts`); Unit keeps thin delegating methods only where call sites are numerous/hot.

**Verified facts (do not re-derive):**
- Unit has **no subclasses** — factories only (`units/index.ts`, `GenericEnemy.ts`, `dark_animals/DarkWolf.ts`). `Unit.fromJSON` is called from `game/managers/UnitManager.ts:~332` and tests.
- **toJSON key order is NOT load-bearing**: the debug `computeSynchash` (`app/js/utils/synchash.ts`) sorts keys before hashing, and multiplayer sync uses `GameEngine.getRuntimeFingerprintHex()` — an incremental event-mix fingerprint, not a hash of serialized JSON. Deep-equality round-trip is the correctness bar. Preserve key order anyway where it costs nothing.
- The conditional-spread guards in toJSON (`...(x != null ? {...} : {})`) and the fromJSON defaults (`?? 1`, `?? 0`, `?? -1`, `chainCcDecayRounds ?? 1`, `active ?? true`) encode backward compat with old snapshots — copy them **verbatim**.
- All private methods move together with their only callers; nothing needs widened visibility. Extracted functions only touch public fields/methods (`unit.takeDamage`, `unit.applyKnockback`, `unit.clearAbilityNote`, ...).
- Since fields are **removed** from Unit when grouped, `npx tsc --noEmit` finds every stale consumer — the compiler is the primary safety net for the rename churn.

Line numbers below refer to Unit.ts **as of the start of this plan** (1,929 lines). Earlier steps shift later line numbers — locate by symbol name, use the numbers as a guide.

---

## Agent Instructions

This plan is executed by the **jp-implement-plan** chain. Each agent reads
`.claude/skills/jp-implement-plan/SKILL.md`, implements exactly **one step** (the first step in
document order with unchecked items), then hands off a fresh agent with:

> Read `.claude/skills/jp-implement-plan/SKILL.md` and follow it for the plan at
> `docs/plans/unit-ts-split.md`.

Additional rules for this plan:

- **Before starting any item**, read the files named in that item's "Touches" line. Do not guess at types or signatures. Read the relevant section of `game/units/Unit.ts` (line ranges are given per step) before moving code.
- Move code **verbatim** — this is a refactor, not a rewrite. Do not "improve" logic, rename behaviourally, or reorder statements inside moved bodies. JSDoc comments move with their code.
- Relevant skills: `game-engine`, `working-on-minion-battles`, `game-object-def-pattern`.
- Per item: `npm run lint` (fix errors), `npx tsc --noEmit` (zero errors — Vite does not surface TS errors at runtime), then `npx vitest run --changed`. After the final step: full `npm run test`.
- The golden serialization test added in Step 1 must pass **unchanged** after every subsequent step. If it fails, the step broke checkpoint compat — fix the step, never the test.
- After verification, change `- [ ]` to `- [x]` and write a one-line summary of what you actually changed beneath the checkbox.
- Known pre-existing test failures (if any) must be confirmed pre-existing via clean-stash before being ignored; note them in the checkbox summary.

---

## Target module map

All new files in `app/js/games/minion_battles/game/units/` unless noted. Budgets are estimates; the 200-line cap is the hard limit.

| File | Contents | Est. lines |
|---|---|---|
| `unitTypes.ts` | `AISettings`, `DamageModifier`, `UnitCombatSettings`, `UnitMovement`, `KnockbackSource`, `KnockbackState`, `ApplyKnockbackParams`, `UnitAbilityRuntimeState`, new `UnitConfig` (constructor arg), new `ActiveCastBehaviourRecord` (map value type) | ~135 |
| `unitPetState.ts` | `UnitPetState` + factory + flat JSON helpers | ~60 |
| `unitLanterniteState.ts` | `UnitLanterniteState` + factory + flat JSON helpers | ~150 |
| `unitThornlingState.ts` | `UnitThornlingState` + factory + flat JSON helpers | ~55 |
| `unitSwarmState.ts` | `UnitSwarmState` + factory + flat JSON helpers | ~120 |
| `../../crowdControl/ccArmourState.ts` | `UnitCcArmourState` + factory + free functions (threshold/land/record/decay) + flat JSON helpers | ~190 |
| `unitCellSlide.ts` | `SLIDE_DIRS`, `findSlideCell`, `checkNextCellOccupancy`, `moveUnitToward` | ~105 |
| `unitMovementTick.ts` | `updateUnit` (buff expiry, wait end, dispatch, path-following), `tickUnitMovement`, wait-proximity failsafe | ~185 |
| `unitKnockback.ts` | `applyKnockbackToUnit`, `updateUnitKnockback` (physics) | ~95 |
| `unitWallUnstick.ts` | `tickWallUnstick`, `tickControlledSlingshot`, `WALL_SNAP_DELAY` | ~190 |
| `unitAbilityQueries.ts` | `getUnitEffectiveSpeed`, `unitHasIFrames`, `isUnitInJuggernautWindow`, `getUnitLungeDistance`, `isEntombedProtectionActive` | ~120 |
| `unitDamage.ts` | `applyDamageToUnit` (stack cascade), `tickUnitDarknessCorruption` | ~100 |
| `unitAbilityLifecycle.ts` | `executeUnitAbility`, `cancelUnitActiveAbility`, `interruptAndRefundUnitAbilities`, `interruptAllUnitAbilities`, `cleanupCastBehavioursForAbility`, `unitRoundStart` | ~190 |
| `unitToJSON.ts` | `serializeUnit(unit, tick)` — spreads the state-module helpers | ~110 |
| `unitFromJSON.ts` | `applySerializedUnitState(unit, data, ...)` + `normalizeLegacyUnitIdentity` (no `new Unit(...)` here — avoids a value-import cycle; construction stays in the `Unit.fromJSON` static) | ~120 |
| **Unit.ts (final)** | Core fields, 5 state-object fields, constructor, resources, status queries, thin delegates, `setMovement` family, buffs, `toJSON`/`fromJSON` delegates | **≤ 400** |

**Named contingencies if Unit.ts exceeds 400 after Step 12:** (a) move `setMovement`/`clearMovement`/`invalidateMovementPath` bodies to `unitMovementTick.ts` (−24); (b) condense multi-line field JSDoc to single lines (−20).

---

## Sub-state object shapes (old flat field → new path)

Serialized JSON keys DO NOT change — only the in-memory access paths. Each state module exports `create*State()` (defaults identical to current field initializers), `*StateToJSON(unit)` (the exact conditional-spread chunk from current toJSON), and `apply*StateFromJSON(unit, data)` (the exact parsing/defaults from current fromJSON).

**`unit.petState: UnitPetState`** — `petOwnerUnitId → petState.ownerUnitId`, `petUnitIds → petState.unitIds`, `petDefId → petState.defId`.

**`unit.lanterniteState: UnitLanterniteState`** — `lanterniteNestOwnerUnitId → nestOwnerUnitId`, `lanternPatrolFarWorld → patrolFarWorld`, `lanternPatrolLeg → patrolLeg`, `lanterniteNestConfig → nestConfig`, `lanterniteNestSpawnState → nestSpawnState`, `lanterniteRole → role`, `lanterniteTargetNestPoiId → targetNestPoiId`, `lanterniteHomeNestPoiId → homeNestPoiId`, `lanterniteConstructionCompleteAtGameTime → constructionCompleteAtGameTime`, `lanterniteAttackReadyAtGameTime → attackReadyAtGameTime`, `lanterniteConstructionAngle → constructionAngle`, `lanterniteConstructionEmitterStarted → constructionEmitterStarted` (runtime-only, not serialized).

**`unit.thornlingState: UnitThornlingState`** — `thornlingNestConfig → nestConfig`, `thornlingNestSpawnState → nestSpawnState`.

**`unit.swarmState: UnitSwarmState`** — `swarmNestConfig → nestConfig`, `swarmNestSpawnState → nestSpawnState`, `swarmNestHomePoiId → nestHomePoiId`, `swarmlingOrbitAngle → orbitAngle`, `swarmlingTargetNestPoiId → targetNestPoiId`, `swarmlingNestOwnerUnitId → nestOwnerUnitId`, `swarmlingConstructionCompleteAtGameTime → constructionCompleteAtGameTime`.

**`unit.ccArmour: UnitCcArmourState`** (in `crowdControl/ccArmourState.ts`, next to its logic) — `ccDurationResistPct → durationResistPct`, `ccDurationFlatSec → durationFlatSec`, `hardCcArmourFloor → hardFloor`, `ccArmourBreakStunDuration → breakStunDuration`, `bonusHardCcArmour → bonusHard`, `hardCcArmourConsumed → hardConsumed`, `chainCcResist → chainResist`, `chainCcDecayRounds → chainDecayRounds`, `chainCcStackNextIncrement → chainStackNextIncrement`, `chainCcDecayRoundCounter → chainDecayRoundCounter`, `softCcArmourFloor → softFloor`, `bonusSoftCcArmour → bonusSoft`, `hardCcArmourEventSerial → eventSerial`, `lastHardCcEventGameTime → lastEventGameTime`, `lastHardCcEventKind → lastEventKind`. The four Unit methods (`getEffectiveHardCcThreshold`, `onSuccessfulHardCcLand`, `recordHardCcArmourEvent`, `tickHardCcChainDecayAtRoundEnd`) become **free functions here** and their call sites are updated (they are being edited for the field rename anyway).

**Stays on Unit core:** `invulnerabilityGenerations` (read by `isInvincible()`, written by both lanternite and swarm nest ticks — cross-domain), `knockbackResistance` getter (def-based), `enrageDef` getter, `tags`, `wallEntryPoint`.

---

## Checklist

### Step 1 — Golden serialization round-trip test (safety net first)

Pin the flat checkpoint shape before touching anything. This test must pass unchanged through every later step.

- [x] In `game/units/Unit.test.ts`, add a test that builds a Unit exercising **every optional serialization branch**: nest/pet/swarm/lanternite fields set (config objects, spawn states, role, POI ids, angles, timers), CC armour fields non-default, knockback active, `tacticalPlan`, `stackSize > 1`, `tags`, `wallEntryPoint`, buffs, resources, abilityRuntime with `replacedAbilityId`, `movement` with `targetPixel`. Assert (a) `JSON.parse(JSON.stringify(unit.toJSON(5)))` deep-equals an inline snapshot (`toMatchInlineSnapshot`) so the flat key set is pinned, and (b) `Unit.fromJSON(unit.toJSON(5), eventBus, 5).toJSON(5)` deep-equals `unit.toJSON(5)` (round-trip stability).
  - **Touches:** `game/units/Unit.test.ts` (read existing round-trip tests first and follow their construction helpers)
  - Added `buildGoldenSerializationUnit` + inline snapshot test; round-trip reattaches Mana via `attachResourcesFromSerializedUnit` (mirrors `UnitManager.restoreFromJSON`).

- [x] Run `npm run lint`, `npx tsc --noEmit`, `npx vitest run app/js/games/minion_battles/game/units/Unit.test.ts`. Then record the full-suite baseline: run `npm run test` and note pass/fail counts and any pre-existing failures beneath this checkbox.
  - **Touches:** nothing (verification only)
  - Unit.test.ts: 8/8 passed. Full suite: 612 passed, 10 failed (6 in `conditionalCancel.test.ts`, 4 in `SimulationRunner.test.ts` — earth-core/claw scenarios; pre-existing on dirty branch, unrelated to Step 1). Lint: 5 pre-existing errors elsewhere.
  - **Confirmed pre-existing (review pass):** the same 10 failures reproduce at the parent commit `ddf57d9~1`, before any refactor changes. Later steps can treat these as the known-failure baseline.

---

### Step 2 — Extract types (`unitTypes.ts`)

Pure type motion; zero runtime change.

- [x] Create `unitTypes.ts` with the 8 interfaces from Unit.ts lines 129–200 (`AISettings`, `DamageModifier`, `UnitCombatSettings`, `UnitMovement`, `KnockbackSource`, `KnockbackState`, `ApplyKnockbackParams`, `UnitAbilityRuntimeState`; import `RecoveryChargeType` type). Add `UnitConfig` (the constructor's inline config object type, lines 488–513) and `ActiveCastBehaviourRecord` (the inline map value type at lines 474–486). In Unit.ts: delete the moved declarations, `export type { ... } from './unitTypes'` for backward compat (`isolatedModules` requires `export type`), type the constructor param as `UnitConfig` and the map as `Map<string, ActiveCastBehaviourRecord>`.
  - **Touches:** `game/units/Unit.ts`, new `game/units/unitTypes.ts`
  - Created `unitTypes.ts` (~120 lines) with all 10 types; Unit.ts imports + re-exports 8 interfaces; constructor/map typed.

- [x] `npm run lint`, `npx tsc --noEmit`, `npx vitest run --changed`. External importers of these types (`storylines/types.ts`, `crowdControl/knockbackKeywords.ts`, UI components, `GenericEnemy.ts`) must compile unchanged via the re-exports.
  - **Touches:** nothing (verification only)
  - tsc: 0 errors. `--changed`: 268 passed, 10 failed (same pre-existing conditionalCancel/SimulationRunner earth-core failures as Step 1). Unit.test.ts 8/8. Lint: 5 pre-existing errors elsewhere.

---

### Step 3 — Pet state (`unitPetState.ts`)

- [x] Create `unitPetState.ts`: `UnitPetState` interface (`ownerUnitId`, `unitIds`, `defId` — docs from Unit.ts lines 384–391 move along), `createPetState()` returning current defaults, `petStateToJSON(unit)` (verbatim conditional spreads from toJSON lines 1671–1673 — keys stay `petOwnerUnitId`/`petUnitIds`/`petDefId`), `applyPetStateFromJSON(unit, data)` (verbatim from fromJSON lines 1794–1802). In Unit.ts: replace the three fields with `petState: UnitPetState = createPetState()`; wire the helpers into toJSON/fromJSON in place of the inline chunks.
  - **Touches:** `game/units/Unit.ts`, new `game/units/unitPetState.ts`
  - Added `unitPetState.ts` (factory + flat JSON helpers) and replaced Unit's pet fields with `petState`, delegating serialization/deserialization through the new helpers.

- [x] Update all consumers of the old flat fields (compiler-driven: `npx tsc --noEmit` lists them; expect `petHelpers.ts`, `unitAI/pet/*` nodes, pet spawn/death logic in `units/index.ts` / managers, `petSystem.test.ts`, mission/scenario fixtures). Mechanical rename only: `unit.petOwnerUnitId → unit.petState.ownerUnitId` etc.
  - **Touches:** whatever `npx tsc --noEmit` reports — read each site, rename the access path only
  - Renamed pet field access paths to `petState.*` across pet helpers/AI nodes, mission spawn wiring, scenario fixtures, and affected unit/preview tests; flat JSON key strings remain unchanged.

- [x] `npm run lint`, `npx tsc --noEmit`, `npx vitest run --changed` — golden test and `petSystem.test.ts` must pass unchanged.
  - **Touches:** nothing (verification only)
  - `tsc --noEmit` passed; `Unit.test.ts` and `petSystem.test.ts` passed under `--changed`; pre-existing failures remained unchanged (10 total in `conditionalCancel.test.ts` + `SimulationRunner.test.ts` earth-core scenarios), and full-suite run stayed at 612 passed / 10 failed; lint still reports unrelated pre-existing workspace errors.

---

### Step 4 — Lanternite + thornling state (`unitLanterniteState.ts`, `unitThornlingState.ts`)

- [x] Create `unitLanterniteState.ts` per the shape table above (fields from Unit.ts lines 393–405 and the lanternite subset of 434–468; docs move along; `constructionEmitterStarted` is runtime-only and excluded from JSON). `lanterniteStateToJSON(unit)` takes the verbatim spreads from toJSON lines 1622–1636 & 1664–1669; `applyLanterniteStateFromJSON` verbatim from fromJSON lines 1712–1733 & 1773–1790. Same pattern for `unitThornlingState.ts` (fields 407–411; toJSON 1637–1647; fromJSON 1734–1745). Replace the fields in Unit.ts with `lanterniteState` / `thornlingState` initialized from factories; wire helpers into toJSON/fromJSON. Note `wallEntryPoint` (toJSON line 1623) is interleaved in the lanternite chunk but is NOT lanternite state — it stays inline in Unit.toJSON.
  - **Touches:** `game/units/Unit.ts`, new `game/units/unitLanterniteState.ts`, new `game/units/unitThornlingState.ts`
  - Added `unitLanterniteState.ts` (161 lines) with split toJSON helpers preserving `wallEntryPoint` key order; `unitThornlingState.ts` (49 lines); Unit uses `lanterniteState` / `thornlingState` factories.

- [x] Update all consumers (compiler-driven; expect `game/lanternite/lanterniteNestTick.ts` (~38 refs), `lanternitePulse.ts`, `unitAI/lanterniteNetwork/*`, `unitAI/lanternitePatrol/*`, `unitAI/lanterniteNestIdle/*`, missions/scenarios, possibly `UnitRenderer.ts` / `GameEngine.ts` / `LevelEventManager.ts`). Mechanical rename only.
  - **Touches:** whatever `npx tsc --noEmit` reports
  - Renamed 16 files to `lanterniteState.*` / `thornlingState.*`; reverted spawn-def flat field reads in `LevelEventManager` and `BaseMissionDef` (mission spawn configs unchanged).

- [x] `npm run lint`, `npx tsc --noEmit`, `npx vitest run --changed` — golden test and lanternite-covering scenario tests (e.g. `darkSwarm.test.ts`, `overrideEnemyEffect.test.ts`) must pass.
  - **Touches:** nothing (verification only)
  - tsc: 0 errors. Golden `Unit.test.ts` 8/8 unchanged; `darkSwarm.test.ts`, `overrideEnemyEffect.test.ts`, `petSystem.test.ts`, `crowdControl.test.ts` passed. `--changed`: 274 passed, 10 failed (same pre-existing earth-core/claw failures).

---

### Step 5 — Swarm state (`unitSwarmState.ts`)

- [x] Create `unitSwarmState.ts` per the shape table (fields from Unit.ts lines 413–432; toJSON lines 1648–1663; fromJSON lines 1746–1772, all verbatim). Replace fields in Unit.ts with `swarmState` from factory; wire helpers.
  - **Touches:** `game/units/Unit.ts`, new `game/units/unitSwarmState.ts`
  - Added `unitSwarmState.ts` (90 lines) with factory + flat JSON helpers; Unit uses `swarmState` factory, delegating serialization through `swarmStateToJSON` / `applySwarmStateFromJSON`.

- [x] Update all consumers (expect `game/lanternite/swarmNestTick.ts` (~34 refs), `unitAI/swarmlingNetwork/*`, missions/scenarios). Mechanical rename only.
  - **Touches:** whatever `npx tsc --noEmit` reports
  - Renamed 5 files to `swarmState.*` (`swarmNestTick.ts`, `snet_seek.ts`, `snet_hunt.ts`, `Unit.test.ts` golden builder); flat JSON key strings unchanged.

- [x] `npm run lint`, `npx tsc --noEmit`, `npx vitest run --changed` — golden test and swarm scenario tests must pass.
  - **Touches:** nothing (verification only)
  - tsc: 0 errors. Golden `Unit.test.ts` 8/8 unchanged; `darkSwarm.test.ts`, `overrideEffect.test.ts` passed. `--changed`: 274 passed, 10 failed (same pre-existing earth-core/claw failures).

---

### Step 6 — CC armour state (`crowdControl/ccArmourState.ts`)

- [x] Create `crowdControl/ccArmourState.ts`: `UnitCcArmourState` per the shape table (fields from Unit.ts lines 317–347), `createCcArmourState()`, free functions with **verbatim bodies** from Unit.ts methods `getEffectiveHardCcThreshold` (687–689), `onSuccessfulHardCcLand` (692–697), `recordHardCcArmourEvent` (699–703), `tickHardCcChainDecayAtRoundEnd` (709–717) — each taking `unit: Unit` (type-only import), plus `ccArmourStateToJSON(unit)` (toJSON lines 1578–1592, same keys) and `applyCcArmourStateFromJSON(unit, data)` (fromJSON lines 1835–1850 with identical defaults). In Unit.ts: replace the 15 fields with `ccArmour` from factory; **delete the four methods** (their call sites are updated next item); `onRoundEnd` calls the free `tickHardCcChainDecayAtRoundEnd(this)`.
  - **Touches:** `game/units/Unit.ts`, new `crowdControl/ccArmourState.ts` (note: `app/js/games/minion_battles/crowdControl/`, NOT under `game/`)
  - Created `ccArmourState.ts` (117 lines) with interface, factory, 4 free functions, toJSON/fromJSON helpers; Unit.ts replaces 15 flat fields with `ccArmour: UnitCcArmourState`; four methods deleted; `onRoundEnd` calls free `tickHardCcChainDecayAtRoundEnd(this)`.

- [x] Update consumers: `crowdControl/knockbackKeywords.ts` and `crowdControl/tryApplyHardCcStun.ts` (field renames + method calls → free-function calls), `game/units/combatCcSpawn.ts` (initialization writes), `BossCcArmourRow.tsx` + `ui/pages/BattlePhase.tsx:~844` (reads / method call → free function), `crowdControl.test.ts`, the `enemy_boss_stun_mechanics` scenario if it references fields directly.
  - **Touches:** whatever `npx tsc --noEmit` reports (the list above is the expected set)
  - Updated 8 files: `knockbackKeywords.ts`, `tryApplyHardCcStun.ts`, `resolveCcDuration.ts`, `combatCcSpawn.ts`, `BattlePhase.tsx`, `crowdControl.test.ts`, `petSystem.test.ts`, `testing/scenarios/general/enemies.ts`, `Unit.test.ts`; `BossCcArmourRow.tsx` had no direct unit access (receives props). tsc: 0 errors.

- [x] `npm run lint`, `npx tsc --noEmit`, `npx vitest run --changed` — golden test and `crowdControl.test.ts` must pass unchanged.
  - **Touches:** nothing (verification only)
  - lint: 5 pre-existing errors only. tsc: 0 errors. vitest: skipped per user instruction (run at end).

---

### Step 7 — Serialization extraction (`unitToJSON.ts`, `unitFromJSON.ts`)

With the state chunks gone, the remaining bodies are small enough to move whole.

- [x] Create `unitToJSON.ts`: `serializeUnit(unit: Unit, currentGameTick: number)` — the full remaining toJSON body (verbatim, spreading the five state-module helpers where the class method currently does). `Unit.toJSON` becomes a one-line delegate. Create `unitFromJSON.ts`: move `LEGACY_PLAYER_CHARACTER_IDS` + the legacy characterId/portraitId normalization (fromJSON lines 1681–1690) into an exported `normalizeLegacyUnitIdentity(data)` helper, and `applySerializedUnitState(unit, data, eventBus, currentGameTick)` containing everything after the `new Unit(...)` call. The `Unit.fromJSON` static keeps: normalize → `new Unit({...})` → `applySerializedUnitState` → return. This keeps `new Unit` inside Unit.ts so `unitFromJSON.ts` needs only a **type** import of Unit (no value cycle).
  - **Touches:** `game/units/Unit.ts`, new `game/units/unitToJSON.ts`, new `game/units/unitFromJSON.ts`
  - Created `unitToJSON.ts` (100 lines) and `unitFromJSON.ts` (112 lines); Unit.toJSON/fromJSON are now one-liner delegates; removed LEGACY_PLAYER_CHARACTER_IDS, serializeTacticalPlan, deserializeTacticalPlan, all state-module toJSON/fromJSON imports from Unit.ts. tsc: 0 errors, lint: same 5 pre-existing errors.

- [x] `npm run lint`, `npx tsc --noEmit`, `npx vitest run --changed` — golden snapshot must be identical to Step 1.
  - **Touches:** nothing (verification only)
  - tsc: 0 errors. lint: 5 pre-existing errors. vitest: skipped per user instruction (run at end).

---

### Step 8 — Cell slide + knockback physics (`unitCellSlide.ts`, `unitKnockback.ts`)

- [x] Create `unitCellSlide.ts`: `SLIDE_DIRS` + `findSlideCell` (Unit.ts lines 84–122 verbatim), `checkNextCellOccupancy(unit, engine)` (private method 926–946 → free function), `moveUnitToward(unit, towardX, towardY, maxDistance)` (method `moveUnit` body 754–774). Create `unitKnockback.ts`: `applyKnockbackToUnit(unit, params, eventBus, onApplied?)` (body 720–736) and `updateUnitKnockback(unit, dt, grid, terrainManager?)` (private physics 953–1007 verbatim). Unit keeps `moveUnit` and `applyKnockback` as one-line delegates (many external callers); `update()` calls the free `updateUnitKnockback`; the path-advance branch calls the free `checkNextCellOccupancy`.
  - **Touches:** `game/units/Unit.ts`, new `game/units/unitCellSlide.ts`, new `game/units/unitKnockback.ts`
  - Created `unitCellSlide.ts` (87 lines) and `unitKnockback.ts` (83 lines) with verbatim bodies; `moveUnit` and `applyKnockback` are now one-liner delegates; removed `SLIDE_DIRS`, `findSlideCell`, `private checkNextCellOccupancy`, `private updateKnockback` from Unit.ts; also removed unused `computeForcedDisplacement`, `type TerrainGrid`, `CellOccupancyManager`, `getUnitMaxPerTile`, `getUnitShovePriority` imports from Unit.ts.

- [x] `npm run lint`, `npx tsc --noEmit`, `npx vitest run --changed`.
  - **Touches:** nothing (verification only)
  - lint: 5 pre-existing errors only. tsc: 0 errors. vitest: skipped per user instruction (run at end).

---

### Step 9 — Ability queries + wall unstick (`unitAbilityQueries.ts`, `unitWallUnstick.ts`)

- [x] Create `unitAbilityQueries.ts`: `getUnitEffectiveSpeed(unit, gameTime)` (1180–1200), `unitHasIFrames(unit, gameTime)` (1231–1246), `isUnitInJuggernautWindow(unit, gameTime)` (1267–1278), `getUnitLungeDistance(unit, engine, base)` (1218–1225), `isEntombedProtectionActive(unit, engine)` (module function 1907–1929, now exported). Unit keeps one-line delegates for the first four (heavily called externally: `getEffectiveSpeed`, `hasIFrames`, `isInJuggernautWindow`, `getLungeDistance`).
  - **Touches:** `game/units/Unit.ts`, new `game/units/unitAbilityQueries.ts`
  - Created `unitAbilityQueries.ts` (107 lines) with all 5 functions; Unit has one-liner delegates for `getEffectiveSpeed`, `hasIFrames`, `isInJuggernautWindow`, `getLungeDistance`; removed stale imports from Unit.ts (`AbilityState`, `unitAbilityHasTag`, `AbilityPhase`/timing group, etc.).

- [x] Create `unitWallUnstick.ts`: `WALL_SNAP_DELAY` (private static → module const), `tickWallUnstick(unit, dt, engine)` (1017–1111), `tickControlledSlingshot(unit, engine)` (1118–1174) — all verbatim; imports `isEntombedProtectionActive` from `unitAbilityQueries.ts` and the existing `slingshotHelpers.ts` functions. If over 200 lines: extract the interrupt-non-cooldown-abilities block (1045–1061) as `interruptNonCooldownAbilities(unit, engine)` into `unitAbilityLifecycle.ts` (created in Step 11 — if taking this contingency, create the file now with just that function).
  - **Touches:** `game/units/Unit.ts`, new `game/units/unitWallUnstick.ts`
  - Created `unitWallUnstick.ts` (169 lines) with `WALL_SNAP_DELAY`, `tickWallUnstick`, `tickControlledSlingshot`; private static and both private methods removed from Unit.ts; all slingshot helpers moved out.

- [x] `npm run lint`, `npx tsc --noEmit`, `npx vitest run --changed`.
  - **Touches:** nothing (verification only)
  - lint: 5 pre-existing errors only. tsc: 0 errors. vitest: skipped per user instruction (run at end).

---

### Step 10 — Movement tick + damage (`unitMovementTick.ts`, `unitDamage.ts`)

- [x] Create `unitMovementTick.ts`: `WAIT_ENEMY_PROXIMITY_FAILSAFE_GRID` const, `hasEnemyWithinWaitProximityFailsafe(unit, engine, max)` (777–792), `updateUnit(unit, dt, engine)` (full `update()` body 794–919 — dispatches to `updateUnitKnockback`, `tickWallUnstick`, `checkNextCellOccupancy` from the modules above), `tickUnitMovement(unit, dt, engine)` (`tickMovement` body 1351–1358 incl. ephemeral despawn). Unit keeps `update` and `tickMovement` as one-line delegates (UnitManager calls them).
  - **Touches:** `game/units/Unit.ts`, new `game/units/unitMovementTick.ts`
  - Created `unitMovementTick.ts` (162 lines); `update` and `tickMovement` are now one-liner delegates; `hasEnemyWithinWaitProximityFailsafe` and the const removed from Unit.ts; also removed stale imports (`TerrainLayerManager`, `areEnemies`, `CELL_SIZE`, `debugSettingsSnapshot`, `PLAYER_WAIT_ENDS_ON_MOVEMENT_COMPLETE`, `MIN_FOLLOW_RADIUS`, `TerrainManager`, `checkNextCellOccupancy`, `updateUnitKnockback`, `tickWallUnstick`).

- [x] Create `unitDamage.ts`: `applyDamageToUnit(unit, amount, sourceUnitId, eventBus): number` (takeDamage body 590–651 verbatim, including god mode, exposed multiplier, earth-core armour, stack cascade, `cant_die`, death events) and `tickUnitDarknessCorruption(unit, dt, engine)` (1329–1349). Unit keeps `takeDamage` and `tickDarknessCorruption` as one-line delegates — `takeDamage` has hundreds of call sites and MUST remain a method.
  - **Touches:** `game/units/Unit.ts`, new `game/units/unitDamage.ts`
  - Created `unitDamage.ts` (88 lines); `takeDamage` and `tickDarknessCorruption` are now one-liner delegates; removed stale imports (`applyDamageToEarthCoreArmour`, `DarknessLevel`) from Unit.ts.

- [x] `npm run lint`, `npx tsc --noEmit`, `npx vitest run --changed`.
  - **Touches:** nothing (verification only)
  - tsc: 0 errors. lint: 5 pre-existing errors, 19 warnings (no change from Step 9 baseline). vitest: skipped per user instruction (run at end).

---

### Step 11 — Ability lifecycle (`unitAbilityLifecycle.ts`)

- [x] Create `unitAbilityLifecycle.ts`: `cleanupCastBehavioursForAbility(unit, active, engine)` (private 1374–1402 — moves with its only callers), `cancelUnitActiveAbility(unit, abilityId, engine)` (1404–1425), `interruptAndRefundUnitAbilities(unit, engine)` (1427–1450), `executeUnitAbility(unit, ability, targets, engine)` (1452–1508), `interruptAllUnitAbilities(unit)` (1294–1301), `unitRoundStart(unit, engine)` (onRoundStart body 1307–1323). Unit keeps one-line delegates for the public ones (`cancelActiveAbility`, `interruptAndRefundAbilities`, `executeAbility`, `interruptAllAbilities`, `onRoundStart`). If over 200 lines: leave `unitRoundStart`'s body in Unit.ts instead.
  - **Touches:** `game/units/Unit.ts`, new `game/units/unitAbilityLifecycle.ts`
  - Created `unitAbilityLifecycle.ts` (163 lines) with all 6 functions; Unit.ts has one-liner delegates; removed `getAbility`, `triggerAbilityEvent`, `AbilityEventType`, `CastBehaviourInterruptContext`, `resolveCastBehaviourTarget`, `AbilityTimingInterval`, `initTelegraphCastPayload` imports from Unit.ts. tsc: 0 errors, lint: same 5 pre-existing errors.

- [x] `npm run lint`, `npx tsc --noEmit`, `npx vitest run --changed`.
  - **Touches:** nothing (verification only)
  - lint: 5 pre-existing errors only. tsc: 0 errors. vitest: skipped per user instruction (run at end).

---

### Step 12 — Final verification + line budget

- [x] Check line counts: `wc -l` on Unit.ts (≤400) and every new file (≤200). If Unit.ts is over, apply the named contingencies in order: (a) move `setMovement`/`clearMovement`/`invalidateMovementPath` to `unitMovementTick.ts` with delegates; (b) condense multi-line field JSDoc to single lines. Record final counts beneath this checkbox.
  - **Touches:** `game/units/Unit.ts` (only if contingencies needed)
  - Applied both contingencies (a) and (b). Final counts: Unit.ts=391, unitAbilityLifecycle.ts=171, unitAbilityQueries.ts=106, unitCellSlide.ts=88, unitDamage.ts=83, unitFromJSON.ts=125, unitKnockback.ts=81, unitMovementTick.ts=178, unitToJSON.ts=113, unitWallUnstick.ts=173, unitPetState.ts=34, unitLanterniteState.ts=152, unitThornlingState.ts=45, unitSwarmState.ts=86, ccArmourState.ts=116, unitTypes.ts=110. All within budget.

- [x] Full verification: `npm run lint`, `npx tsc --noEmit`, full `npm run test`. Results must match the Step 1 baseline (golden test unchanged, no new failures). Note results beneath this checkbox.
  - **Touches:** nothing (verification only)
  - lint: 5 pre-existing errors only. tsc: 0 errors. `npm run test`: 612 passed / 10 failed — identical to Step 1 baseline (same pre-existing earth-core/claw failures in conditionalCancel.test.ts + SimulationRunner.test.ts).

- [x] Grep for stragglers: `grep -rn "petOwnerUnitId\|lanterniteNestConfig\|swarmNestConfig\|hardCcArmourFloor" app/js --include="*.ts" --include="*.tsx"` — remaining hits should ONLY be inside the state modules' serialization helpers (flat JSON keys) and test snapshot strings. Anything else is a missed rename; fix it.
  - **Touches:** anything the grep reveals
  - All hits are expected: state module serialization helpers (flat JSON keys), unit def schema property names, test inline snapshots, and one comment. No stale renames.

---

## AbilityTest philosophy for this plan

**No new AbilityTest scenarios.** This is a behaviour-preserving refactor; the regression net is:
- The **golden serialization test** (Step 1) — pins the checkpoint wire format.
- The existing high-level scenario suite (`SimulationRunner.test.ts`, `darkSwarm.test.ts`, `overrideEnemyEffect.test.ts`, `ai_serialization_roundtrip`, `crowdControl.test.ts`, `petSystem.test.ts`, `DefaultAITree.test.ts`) already exercises nest spawning, swarmling networks, pets, CC armour, and AI round-trips end-to-end — exactly the E2E-style coverage jp-plan wants.

If any step reveals a behaviour gap not covered by an existing scenario, note it under Out of Scope as a follow-up rather than adding scenarios mid-refactor.

---

## What is explicitly OUT OF SCOPE

- Any behaviour change, tuning change, or bug fix discovered along the way (note it in `docs/TODO.md` instead).
- Changing the serialized JSON shape (e.g. nesting `petState` in checkpoints). The flat wire format stays.
- Generalizing the three `{nestConfig, nestSpawnState}` triples into one generic nest-state abstraction — reasonable future cleanup, not now.
- Moving `setMovement`/`clearMovement`/`invalidateMovementPath` (unless the Step 12 contingency fires).
- Touching `unitAI/*`, `GameEngine.ts` tick order, or manager structure beyond mechanical field renames.
- Updating `.claude/skills/*` or memory docs that mention old field names (do at the end only if trivially greppable; otherwise TODO).

---

## File Reference Map

| File | Role |
|---|---|
| `game/units/Unit.ts` | The class being split; keeps core state + thin delegates |
| `game/units/unitAbilityTick.ts` | Existing extraction — the pattern to copy (free fn, `unit` first param, type-only Unit import) |
| `game/units/Unit.test.ts` | Round-trip tests + new golden test (Step 1) |
| `game/managers/UnitManager.ts` | Calls `unit.update`/`tickMovement`/`Unit.fromJSON` — signatures must not change |
| `crowdControl/knockbackKeywords.ts`, `crowdControl/tryApplyHardCcStun.ts` | CC armour logic consumers (Step 6) |
| `game/units/combatCcSpawn.ts` | CC armour initialization from unit defs (Step 6) |
| `game/lanternite/lanterniteNestTick.ts`, `swarmNestTick.ts`, `lanternitePulse.ts` | Heaviest nest-field consumers (Steps 4–5) |
| `game/units/petHelpers.ts`, `unitAI/pet/*` | Pet-field consumers (Step 3) |
| `app/js/utils/synchash.ts`, `GameEngine.getRuntimeFingerprintHex` | Why JSON key order is not load-bearing (verified — do not add key-order constraints) |
