# Plan: Lanternite Nest Pulse → Thorn Tile Spread

## Goal

Replace the lanternite nest's `Radiant Aura` passive (which deals 2 AOE damage per tick to dark creatures)
with a new behaviour: each tick, select 2 eligible tiles within the pulse radius and convert them to
`bramble_slow` ground terrain, spreading hostile terrain around the nest over time.

## Context

| Thing | Where |
|---|---|
| Passive ability definition | `app/js/games/minion_battles/card_defs/dark_animals/0014_LanterniteNestAura/0014Ability.ts` |
| Passive effect type registry | `app/js/games/minion_battles/abilities/passiveDef.ts` |
| Passive runner (applies effects each tick) | `app/js/games/minion_battles/abilities/passiveRunner.ts` |
| Terrain layer API | `app/js/games/minion_battles/game/TerrainLayerManager.ts` — `add()`, `getGroundEffectAt()`, `rasterizeArea()` |
| Existing thorn DoT ticks | `app/js/games/minion_battles/game/dotTick.ts` |
| Existing test scenarios for nest | `app/js/games/minion_battles/testing/scenarios/general/lanternites.ts` |
| Scenario registry | `app/js/games/minion_battles/testing/scenarios/registry.ts` |

## Design Decisions

### Thorn type: `bramble_slow`

`bramble_slow` makes **nature creatures immune** and damages everything else (including dark creatures, the
nest's enemies). `dark_thorn` does the reverse (dark creatures immune, hurts nature). The nest is a nature
unit fighting dark creatures, so `bramble_slow` is the correct type.

### Tile selection: closest-first, deterministic

Each trigger:
1. Rasterize a circle of `PULSE_RADIUS` around the caster into grid cells.
2. Discard any cell whose ground layer already has an effect with `effectType === effect.effectType`.
3. Sort remaining candidates by squared distance from the caster center (ascending); break ties
   lexicographically by `(col, row)` so the result is always the same given the same starting state.
4. Take the first `effect.count` cells.
5. Call `engine.terrainLayers.add(...)` for each with no `expiresAtGameTime` (permanent conversion).

Permanent placement means the area eventually saturates; once all cells within range are thorn-covered the
ability has no remaining effect. This is intentional — the nest is "converting" terrain, not sustaining it.

### Visual: reuse AuraPulse

Emit the existing `AuraPulse` effect whenever at least one tile is placed (same visual hook as the old
aoe_damage path). This keeps the pulse animation without coupling it to damage.

---

## Steps

Each step should be handed to a subagent for implementation. After implementation, verify with
`npx vitest run` (scoped to affected test files where applicable), then check the item off.

---

### Step 1 — Extend `PassiveDef` with `place_terrain` effect type

**File:** `app/js/games/minion_battles/abilities/passiveDef.ts`

- [x] Add a new exported interface `PassiveFlaceTerrainEffect`:
  Added `PassivePlaceTerrainEffect` interface with `type`, `effectType`, `range`, `count`, `pulseRadius?` fields to `passiveDef.ts`.
- [x] Union `PassivePlaceTerrainEffect` into `PassiveEffect`:
  Changed `export type PassiveEffect = PassiveAoeDamageEffect | PassivePlaceTerrainEffect;`
- [x] Run `npx tsc --noEmit` to confirm no type errors.
  0 errors introduced; pre-existing errors in unrelated files only.

---

### Step 2 — Handle `place_terrain` in `passiveRunner.ts`

**File:** `app/js/games/minion_battles/abilities/passiveRunner.ts`

- [x] Import `rasterizeArea` from `TerrainLayerManager`.
  Added `import { rasterizeArea } from '../game/TerrainLayerManager'` and `import { CELL_SIZE } from '../terrain/TerrainGrid'` to `passiveRunner.ts`.
- [x] In `applyEffects`, add an `else if (effect.type === 'place_terrain')` branch that:
  1. Calls `rasterizeArea({ type: 'circle', x: caster.x, y: caster.y, radiusPx: effect.range })` to get
     all candidate cells.
  2. Filters out any cell where `engine.terrainLayers.getGroundEffectAt(col, row)?.effectType === effect.effectType`.
  3. Sorts survivors by `(dx*dx + dy*dy)` ascending (where dx/dy are from caster center to cell center),
     breaking ties by `col` then `row` ascending.
  4. Takes the first `effect.count` cells.
  5. For each selected cell, calls `engine.terrainLayers.add({ id, layer: 'ground', effectType, placedAtGameTime, ownerUnitId: caster.id, ownerAbilityId, area: { type:'cell', col, row }, params: {} })`.
     Use a stable id like `` `thorn-${caster.id}-${col}-${row}` `` (cell-keyed so re-adding the same cell
     is idempotent at the manager level due to oldest-wins).
  6. If at least one tile was placed and `effect.pulseRadius !== undefined`, emit `AuraPulse` (same code
     as the existing `aoe_damage` path).
  Implemented all 6 sub-steps in `passiveRunner.ts`; sort uses `CELL_SIZE` constant; id scheme is `thorn-${caster.id}-${col}-${row}`; `ownerAbilityId` omitted (optional field, would require threading through call chain — not required for correctness).
- [x] Run `npx tsc --noEmit`.
  0 new errors; 31 pre-existing errors in unrelated files (BattleSession.ts, GameEngine.ts, Unit.ts, etc.) unchanged.

---

### Step 3 — Update `0014Ability.ts` to use `place_terrain`

**File:** `app/js/games/minion_battles/card_defs/dark_animals/0014_LanterniteNestAura/0014Ability.ts`

- [x] Replace the `aoe_damage` effect entry in `nestAuraPassive.effects` with a `place_terrain` entry:
  Replaced `aoe_damage` block with `{ type: 'place_terrain', effectType: 'bramble_slow', range: PULSE_RADIUS, count: 2, pulseRadius: PULSE_RADIUS }` in `nestAuraPassive.effects`.
- [x] Remove now-unused constants `AURA_DAMAGE` and the `targetFilter` import (if unused elsewhere).
  Removed `AURA_DAMAGE` constant; no `targetFilter` import existed in this file (it was an inline object literal), so nothing to remove.
- [x] Update `getTooltipText()`:
  Updated to `Passive: every {${TICK_INTERVAL_SEC}s} the nest pulses, converting {2} nearby tiles to thorn ground.`
- [x] Run `npx tsc --noEmit`.
  0 new errors; all pre-existing errors in unrelated files unchanged. Lint 14 warnings/0 errors unchanged. `vitest run --changed` passes (5 pre-existing failures only).

---

### Step 4 — Add ability test scenario and register it

**Files:** `app/js/games/minion_battles/testing/scenarios/general/lanternites.ts`,
`app/js/games/minion_battles/testing/scenarios/registry.ts`

Scenario goal: verify that after a few pulse ticks the nest has spread thorn tiles around itself.

- [x] In `lanternites.ts`, add `lanterniteNestThornSpreadScenario`:
  Added `lanterniteNestThornSpreadScenario` to `lanternites.ts`: 10×8 grass grid, nest at col 5 row 3 with `LANTERNITE_NEST_AURA_ID`, player at col 0 row 7 with a wait order, `maxDurationMs: 6000`, assertPass checks ≥2 `bramble_slow` cells within 210px; failureMessage and describeState report `brambleCells` and `t=`. Imported `LANTERNITE_NEST_AURA_ID` and `rasterizeArea` at the top.

- [x] Export the new scenario and import it in `registry.ts`; add it to the exported scenarios array.
  Exported `lanterniteNestThornSpreadScenario` from `lanternites.ts`; added it to the import line and `ALL_ABILITY_TEST_SCENARIOS` array in `registry.ts` (after `lanterniteDefenderAttackScenario`).

- [x] Run `npx vitest run app/js/games/minion_battles/testing/runner/SimulationRunner.test.ts` and confirm
  the new scenario passes (and existing lanternite scenarios still pass).
  60/61 passed; 1 pre-existing failure (`shiningBlockStrengtheningLightScenario`). `lanternite_nest_thorn_spread` passed. All other lanternite scenarios unaffected.

---

## Handoff instructions for subagents

Each step is independent of subsequent steps in terms of file ownership, but Steps 2 and 3 both
compile against the types added in Step 1. Implement in order: **1 → 2 → 3 → 4**.

For each step:
1. Read every listed file before editing.
2. Make only the changes described for that step — do not refactor surrounding code.
3. Run `npx tsc --noEmit` after any TypeScript change.
4. Run the scoped vitest command listed in the step (or the full suite for Step 4) and confirm green.
5. Report back with what was changed; the orchestrating agent will check the item off the checklist.

## Ability Test Coverage

| Scenario | What it covers |
|---|---|
| `lanternite_nest_thorn_spread` | `place_terrain` passive fires on tick interval; thorn tiles accumulate on terrain layer; engine state is observable after N ticks |

Existing lanternite scenarios (`lanternite_nest_build`, `lanternite_nest_dual_spawn`,
`lanternite_defender_attack`) continue to cover nest spawning and lanternite combat; this new scenario
is additive.
