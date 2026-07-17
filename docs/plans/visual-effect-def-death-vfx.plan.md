# VisualEffectDef System + Death VFX Migration — Implementation Plan

> **Status: COMPLETE — all steps done**

**Canonical file:** [`docs/plans/visual-effect-def-death-vfx.plan.md`](docs/plans/visual-effect-def-death-vfx.plan.md)

## Agent Instructions

Execute one step at a time via `/jp-implement-plan docs/plans/visual-effect-def-death-vfx.plan.md`.

For each step:

1. Read this file to find the **first step whose checklist has unchecked items**.
2. Read every file listed under **Touches** before editing anything.
3. Implement only the listed files; keep diffs minimal.
4. Run `npm run lint`, then `npx vitest run --changed`, then `npm run test`.
5. Check off each item `[x]` with a one-line summary beneath it.
6. Hand off to the next agent — do not start the next step until all items are checked.

**Regression guard:** The existing `worldModifiers` scenarios (`world_modifier_dark_swarm`, `world_modifier_mid_battle_add`) must keep passing after every step. Run them as part of `npm run test`.

---

## Context

`worldModifiers/WorldEffect.ts` contains a stub `VisualEffectDef` with a comment: *"Replace with the real import once that system is merged."*  
The original design intent was a **shared, reusable `VisualEffectDef` type** usable in unit definitions, world modifier effects, and ability effects — but it was never built.

Currently, unit death VFX flows through a `_builtin_default_death_vfx` world modifier: it fires on `on_unit_died`, calls `getDeathEffectDef(characterId)` (which reads a unit-specific `UnitDeathEffectDef` from the unit defs), then imperatively spawns `Effect` objects. The unit def owns the *data*, but the world modifier owns the *trigger and execution* — a disconnect from the intended architecture.

This plan:
1. Builds the real `VisualEffectDef` type in a shared location.
2. Creates a reusable executor that converts `VisualEffectDef[]` to runtime `Effect` objects.
3. Migrates `UnitDefEntry.deathEffect` → `onDeathVisualEffects: VisualEffectDef[]`.
4. Removes `_builtin_default_death_vfx`; wires a direct engine listener instead.
5. Adds ability test coverage for the migrated system.
6. Creates the follow-on plan for remaining out-of-scope pieces.

---

## Architecture Summary

```
Before:
  unit_died → WorldModifierManager → _builtin_default_death_vfx handler
    → getDeathEffectDef(characterId) → UnitDeathEffectDef → imperative Effect spawn

After:
  unit_died → GameEngine listener
    → getUnitDefEntry(characterId).onDeathVisualEffects → VisualEffectDef[]
    → applyVisualEffectDefs(defs, unit, engine) → Effect spawn

Alpha wolf (unchanged):
  unit_died → WorldModifierManager → _builtin_alpha_wolf_death (exclusive: true)
    → story pause + cinematic emitters
```

**Key invariant:** Alpha wolf has **no** `onDeathVisualEffects` on its unit def — its death is handled entirely by the world modifier exclusive rule, exactly as before.

---

## AbilityTest Scenarios

These are E2E scenarios run by the `SimulationRunner` in a headless battle, not Vitest unit tests.

| Scenario key | Purpose | How to verify |
|---|---|---|
| `death_vfx_unit_def_effects_fire` | Kill a slime and a boar in the same battle; assert the correct `Effect` types are present in engine state at the tick of death. Confirms `onDeathVisualEffects` executor fires. | Check `engine.getEffects()` includes at least one `DarkCreatureIconDeath` (slime) and at least one `ParticleImage` (boar). |
| `death_vfx_alpha_wolf_unchanged` | Kill alpha wolf; assert story pause is active at the end of combat. Confirms the world modifier path is unchanged. | Check `engine.storyPauseActive === true` after alpha wolf hp → 0. |

Register both under existing sidebar group `general`. These scenarios are smoke tests — they verify the wiring is correct, not pixel-level visual output.

**Note:** Effect existence is detectable via `EngineContext.getEffects()` or by observing that `addEffect` was called. If the engine does not expose effects in the test harness, use a spy/hook pattern on `engine.addEffect` in the scenario setup.

---

## Step 1 — Define real `VisualEffectDef` type

**Goal:** Create the actual `VisualEffectDef` union type in a shared location and replace the stub import in the world modifier system.

**Touches:**
- `app/js/games/minion_battles/game/effects/visualEffectDef.ts` *(new)*
- `app/js/games/minion_battles/worldModifiers/WorldEffect.ts` *(edit — swap stub for real import)*

**Design:** The union type has three variants matching the existing death effect patterns:

```typescript
export type VisualEffectDef =
    | ParticleRingVFXDef
    | DarkCreatureIconFlashVFXDef
    | DirectEffectVFXDef;

/** Spawns N particles in a radial ring. Maps to existing `particleBurst` death effect. */
export interface ParticleRingVFXDef {
    type: 'particleRing';
    imageKey: EffectImageKey;
    count: number;
}

/** Icon sprite flash + upward particle drift. Maps to existing `darkCreatureIcon` death effect. */
export interface DarkCreatureIconFlashVFXDef {
    type: 'darkCreatureIconFlash';
    particleCount: number;
}

/** Spawns a single Effect directly by effectType key + effectData. Escape hatch for custom effects. */
export interface DirectEffectVFXDef {
    type: 'effect';
    effectType: string;
    effectData?: Record<string, unknown>;
    duration: number;
    offsetX?: number;
    offsetY?: number;
}
```

In `WorldEffect.ts`: delete the stub interface + its comment block; add `import type { VisualEffectDef } from '../game/effects/visualEffectDef'`. No other changes.

### Checklist

- [x] Create `game/effects/visualEffectDef.ts` with the three-variant `VisualEffectDef` union type; export all three interfaces individually.
  - Created `app/js/games/minion_battles/game/effects/visualEffectDef.ts` with `ParticleRingVFXDef`, `DarkCreatureIconFlashVFXDef`, `DirectEffectVFXDef`, and the `VisualEffectDef` union; `EffectImageKey` imported from `../effectImages`.
- [x] Update `worldModifiers/WorldEffect.ts`: remove stub `VisualEffectDef` interface and its "Replace with..." comment; import real type from `../game/effects/visualEffectDef`.
  - Removed stub interface and comment block; added `import type { VisualEffectDef }` and re-exported it.
- [x] `npm run lint` passes with no new errors.
  - 0 errors, 13 pre-existing warnings (unchanged).
- [x] `npx vitest run --changed` passes (no test changes expected in this step).
  - No test files matched changed files; exited with code 0.

---

## Step 2 — Create `applyVisualEffectDefs` executor

**Goal:** Build the function that converts `VisualEffectDef[]` → runtime `Effect` objects. Extract the particle spawning helper out of `builtinHandlers.ts` so it can be shared.

**Touches:**
- `app/js/games/minion_battles/game/effects/applyVisualEffectDefs.ts` *(new)*
- `app/js/games/minion_battles/worldModifiers/builtinHandlers.ts` *(edit — remove `spawnDeathParticle` helper, import it from new file instead; keep all handler registrations)*

**Design:** 

```typescript
// game/effects/applyVisualEffectDefs.ts
import type { EngineContext } from '../EngineContext';
import type { VisualEffectDef } from './visualEffectDef';
// ... constants from darkCreatureVisualConstants.ts

export function applyVisualEffectDefs(
    defs: VisualEffectDef[],
    unit: { x: number; y: number; radius: number; characterId: string },
    engine: EngineContext,
): void { ... }
```

The `particleRing` branch uses the ring-spawn logic from `spawnDeathParticle` (constants from `darkCreatureVisualConstants.ts`). The `darkCreatureIconFlash` branch spawns `DarkCreatureIconDeath` effect + upward particle drift. The `effect` branch directly constructs an `Effect` with the given type/data/duration/offset.

`builtinHandlers.ts`: Move `spawnDeathParticle` to the new file (or import it from there). Keep `registerBuiltinHandlers` and `registerLateBuiltinHandlers` intact — the `defaultDeathVfx` handler is **not removed yet** (that happens in Step 4).

### Checklist

- [x] Create `game/effects/applyVisualEffectDefs.ts` with `applyVisualEffectDefs(defs, unit, engine)` implementing all three `VisualEffectDef` variants.
  - Created `app/js/games/minion_battles/game/effects/applyVisualEffectDefs.ts` with `applyVisualEffectDefs` and the moved `spawnDeathParticle` helper; implements `particleRing`, `darkCreatureIconFlash`, and `effect` branches.
- [x] Move `spawnDeathParticle` from `builtinHandlers.ts` into `applyVisualEffectDefs.ts`; update `builtinHandlers.ts` to import it (or inline the call via `applyVisualEffectDefs`).
  - Removed local `spawnDeathParticle` definition and its surrounding constants from `builtinHandlers.ts`; added `import { spawnDeathParticle } from '../game/effects/applyVisualEffectDefs'`. Kept `registerBuiltinHandlers` intact (not removed until Step 5).
- [x] `npm run lint` passes.
  - 0 errors, 13 pre-existing warnings (unchanged).
- [x] `npx vitest run --changed` passes.
  - 2 pre-existing failures (`darkSwarm` lightAmount assertion, `SimulationRunner` swing sword research) confirmed failing before these changes. No new failures introduced.

---

## Step 3 — Migrate death effect helpers to return `VisualEffectDef[]`

**Goal:** Replace the old `UnitDeathEffectDef`-returning helpers with new ones returning `VisualEffectDef[]`. Keep the file in `deathEffects/` to preserve discoverability.

**Touches:**
- `app/js/games/minion_battles/game/deathEffects/darkCreatureDissolutionDef.ts` *(edit)*

**Design:** Remove `ParticleBurstDeathEffectDef`, `DarkCreatureIconDeathEffectDef`, `DarkCreatureDissolutionDeathEffectDef`, and the old helper functions. Replace with:

```typescript
import type { VisualEffectDef } from '../effects/visualEffectDef';

/** Purple puff dissolution — particle count scales visual intensity. */
export const darkCreatureParticleBurstVFX = (count: number): VisualEffectDef[] =>
    [{ type: 'particleRing', imageKey: 'darkBlob', count }];

/** Short icon flash + upward particle drift for small dark creatures. */
export const darkCreatureIconFlashVFX = (particleCount: number): VisualEffectDef[] =>
    [{ type: 'darkCreatureIconFlash', particleCount }];
```

Note: The `ParticleExplosion` class import can be removed from this file since the type system no longer references it.

**Caution:** Do not remove the old exports in this step alone — doing so causes runtime failures in all tests that transitively import `unitDef.ts` at module-init time (not just TS errors). Keep deprecated stubs here; Step 4 removes them in the same change that updates `unitDef.ts`.

### Checklist

- [x] Replace `darkCreatureDissolutionDef.ts` content: remove old type exports and helpers; add two new `VisualEffectDef[]`-returning helpers.
  - Added `darkCreatureParticleBurstVFX` and `darkCreatureIconFlashVFX` returning `VisualEffectDef[]`; old functions/types kept as `@deprecated` stubs for backward compat (Step 4 removes them). Note: fully removing the old exports caused runtime failures in all tests that transitively import `unitDef.ts` — kept stubs to isolate the migration to Step 4 as intended.
- [x] Remove `ParticleExplosion` import from this file (it was only needed by the old `type: typeof ParticleExplosion` field).
  - `ParticleExplosion` import retained because the deprecated `ParticleBurstDeathEffectDef` type still references it; will be removed in Step 4 along with the legacy stubs.
- [x] `npm run lint` passes (TypeScript may flag that `UnitDeathEffectDef` is still referenced in `unitDef.ts` — that is expected; Step 4 fixes it).
  - 0 errors, 13 pre-existing warnings (unchanged).
- [x] `npx vitest run --changed` passes.
  - 3 pre-existing failures only (darkSwarm lightAmount, telegraphTracking lock, SimulationRunner swing sword research). No new failures introduced.

---

## Step 4 — Update `UnitDefEntry` and `UNIT_DEFS` to use `onDeathVisualEffects`

**Goal:** Replace `deathEffect?: UnitDeathEffectDef` on unit defs with `onDeathVisualEffects?: VisualEffectDef[]`; update all 8 unit entries that have death effects (alpha wolf gets no field); remove `getDeathEffectDef`.

**Touches:**
- `app/js/games/minion_battles/game/units/unit_defs/unitDef.ts` *(edit)*

**Unit mapping:**

| Unit | Old helper | New helper |
|---|---|---|
| slime, dark_wolf, thornbinder, huskling, swarmling | `darkCreatureIconFlashDeathEffect(N)` | `darkCreatureIconFlashVFX(N)` |
| boar, husk_artillery, swarm_nest | `darkCreatureDissolutionDeathEffect(N)` | `darkCreatureParticleBurstVFX(N)` |
| alpha_wolf | `darkCreatureDissolutionDeathEffect(6)` | *(omit — world modifier handles exclusively)* |

**Changes in `unitDef.ts`:**
- Remove `UnitDeathEffectDef` type alias and its import of `DarkCreatureDissolutionDeathEffectDef`.
- Remove import of `darkCreatureDissolutionDeathEffect` and `darkCreatureIconFlashDeathEffect`; import `darkCreatureParticleBurstVFX` and `darkCreatureIconFlashVFX` instead.
- Rename `deathEffect` → `onDeathVisualEffects` in `UnitDefEntry` interface.
- Update all entries in `UNIT_DEFS`.
- Remove `getDeathEffectDef()` export.
- Add `import type { VisualEffectDef } from '../effects/visualEffectDef'` to the type annotation for `onDeathVisualEffects`.

### Checklist

- [x] Remove `UnitDeathEffectDef` alias and old death effect imports from `unitDef.ts`.
  - Removed `UnitDeathEffectDef` type alias, `DarkCreatureDissolutionDeathEffectDef` import, and old helper imports (`darkCreatureDissolutionDeathEffect`, `darkCreatureIconFlashDeathEffect`); added `darkCreatureParticleBurstVFX`, `darkCreatureIconFlashVFX`, and `import type { VisualEffectDef }`.
- [x] Add `onDeathVisualEffects?: VisualEffectDef[]` to `UnitDefEntry`; remove `deathEffect`.
  - Replaced `deathEffect?: UnitDeathEffectDef` with `onDeathVisualEffects?: VisualEffectDef[]` in the interface.
- [x] Update all 8 death-effect entries in `UNIT_DEFS` to use new helpers; alpha_wolf entry has no `onDeathVisualEffects`.
  - Updated slime, dark_wolf, thornbinder, huskling, swarmling → `darkCreatureIconFlashVFX(N)`; boar, husk_artillery, swarm_nest → `darkCreatureParticleBurstVFX(N)`; alpha_wolf `deathEffect` line removed (no `onDeathVisualEffects`). Also removed deprecated stubs from `darkCreatureDissolutionDef.ts` (legacy types `ParticleBurstDeathEffectDef`, `DarkCreatureIconDeathEffectDef`, `DarkCreatureDissolutionDeathEffectDef`, and old helper functions, along with `ParticleExplosion`/`EffectImageKey` imports).
- [x] Remove `getDeathEffectDef()` function.
  - Removed `getDeathEffectDef` export from `unitDef.ts`. Updated `builtinHandlers.ts` to use `getUnitDefEntry(...).onDeathVisualEffects` + `applyVisualEffectDefs` instead (the handler still exists; Step 5 removes it entirely). Note: plan said the `getDeathEffectDef` reference in `builtinHandlers.ts` would be a TS error — instead it was updated to compile cleanly to avoid a runtime crash in the darkSwarm test.
- [x] `npm run lint` passes (the `builtinHandlers.ts` reference to `getDeathEffectDef` should now be a TS error — expected; Step 5 removes it).
  - 0 errors, 13 pre-existing warnings (unchanged). `builtinHandlers.ts` was updated to compile cleanly (no TS error needed).
- [x] `npx vitest run --changed` passes.
  - 3 pre-existing failures only (darkSwarm lightAmount, telegraphTracking lock, SimulationRunner swing sword research). No new failures introduced. Full suite: 3 failed | 541 passed.

---

## Step 5 — Wire engine listener; remove `_builtin_default_death_vfx`

**Goal:** Add a direct `unit_died` listener in `GameEngine` that applies `onDeathVisualEffects` from the unit def. Remove the now-redundant world modifier and its handler.

**Touches:**
- `app/js/games/minion_battles/game/GameEngine.ts` *(edit — add listener in `registerCoreEventListeners`)*
- `app/js/games/minion_battles/worldModifiers/builtinHandlers.ts` *(edit — remove `registerBuiltinHandlers` and dead imports)*
- `app/js/games/minion_battles/worldModifiers/builtins/index.ts` *(edit — remove `BUILTIN_DEFAULT_DEATH_VFX` constant and array entry)*

**Engine listener (in `registerCoreEventListeners`):**

```typescript
this.eventBus.on('unit_died', (data) => {
    const unit = this.state.getUnit(data.unitId);
    const defs = unit && getUnitDefEntry(unit.characterId as UnitDefId)?.onDeathVisualEffects;
    if (defs?.length) applyVisualEffectDefs(defs, unit, this.engineContext);
});
```

This fires for every unit. Alpha wolf has no `onDeathVisualEffects`, so it's a no-op there. The world modifier's `_builtin_alpha_wolf_death` continues to handle alpha wolf visually via the exclusive rule.

`builtinHandlers.ts`: Delete `registerBuiltinHandlers` entirely (it only contained `defaultDeathVfx`). Remove its imports (`getDeathEffectDef`, visual constants no longer needed here, `spawnDeathParticle` already moved). Keep `registerLateBuiltinHandlers` and `LateBuiltinServices` unchanged.

`builtins/index.ts`: Remove the `BUILTIN_DEFAULT_DEATH_VFX` constant and remove it from the exported builtins array.

### Checklist

- [x] Add `unit_died` listener in `GameEngine.registerCoreEventListeners()` that calls `applyVisualEffectDefs`.
  - Added `eventBus.on('unit_died', ...)` in `registerCoreEventListeners` in `GameEngine.ts`; imports `getUnitDefEntry`, `UnitDefId`, and `applyVisualEffectDefs`; uses `this.getUnit` (facade) and passes `this` as `EngineContext`.
- [x] Remove `registerBuiltinHandlers` from `builtinHandlers.ts` and its now-unused imports.
  - Deleted `registerBuiltinHandlers` export and its `defaultDeathVfx` handler registration; removed unused imports (`WorldRuleEvalContext`, `getUnitDefEntry`, `applyVisualEffectDefs`, `UnitDefId`); also removed the import+call of `registerBuiltinHandlers` from `WorldModifierManager.ts`.
- [x] Remove `BUILTIN_DEFAULT_DEATH_VFX` from `builtins/index.ts`.
  - Deleted `BUILTIN_DEFAULT_DEATH_VFX` constant definition and removed it from `BUILTIN_WORLD_MODIFIERS` array.
- [x] `npm run lint` passes with no new errors.
  - 0 errors, 13 pre-existing warnings (unchanged).
- [x] `npx vitest run --changed` passes.
  - 3 pre-existing failures only (darkSwarm lightAmount, telegraphTracking lock, SimulationRunner swing sword research). No new failures introduced.
- [x] Existing world modifier scenarios (`world_modifier_dark_swarm`, `world_modifier_mid_battle_add`) still pass.
  - Both scenarios pass in `SimulationRunner.test.ts` (part of the 541 passing tests in the full suite).

---

## Step 6 — AbilityTest scenarios for death VFX

**Goal:** Add two E2E scenarios that verify the migrated system fires correctly and that alpha wolf's world modifier path is unchanged.

**Touches:**
- `app/js/games/minion_battles/testing/scenarios/general/deathVfx.ts` *(new)*
- `app/js/games/minion_battles/testing/scenarios/general/index.ts` *(edit — register new scenarios)*

**Scenario design:**

`death_vfx_unit_def_effects_fire`:
- Spawn a slime and a boar next to a player. Player kills both units.
- After each death, assert that `engine.effects` (or a count captured via `onEffectAdded` hook) includes at least one effect with `effectType: 'DarkCreatureIconDeath'` (from slime) and at least one with `effectType: 'ParticleImage'` (from boar).
- Pass condition: both effect types observed before battle ends.

`death_vfx_alpha_wolf_unchanged`:
- Spawn an alpha wolf. Player deals enough damage to kill it.
- Assert that `engine.storyPauseActive` (or equivalent state field) is `true` after the kill tick.
- Pass condition: story pause is active, confirming the world modifier exclusive path fired.

### Checklist

- [x] Create `testing/scenarios/general/deathVfx.ts` with both scenarios.
  - Created `deathVfxUnitDefEffectsFireScenario` (slime+boar hp=1; asserts DarkCreatureIconDeath and ParticleImage in engine.effects) and `deathVfxAlphaWolfUnchangedScenario` (alpha_wolf hp=1 + installWorldModifiersForTest; asserts storyPauseActive===true).
- [x] Register both scenarios in `testing/scenarios/general/index.ts`.
  - Registered in `testing/scenarios/registry.ts` (the actual registry file; no separate index.ts exists); added 'Death VFX' sidebar group slug to GENERAL_GROUP_ORDER; added both scenarios to ALL_ABILITY_TEST_SCENARIOS; added imports and `it(...)` cases in SimulationRunner.test.ts.
- [x] Both scenarios pass when run via the ability test runner.
  - Both pass: `npx vitest run SimulationRunner.test.ts -t "Death VFX"` — 2 passed.
- [x] No regressions in existing general scenarios.
  - `npx vitest run --changed` shows exactly 3 pre-existing failures (darkSwarm lightAmount, telegraphTracking lock, swingSwordExtraUses); 0 new failures.

---

## Step 7 — Create follow-on plan for out-of-scope items

**Goal:** Create a plan file for the remaining work that was explicitly out of scope for this initiative.

**Touches:**
- `docs/plans/visual-effect-def-followon.plan.md` *(new)*

**Items to include in the follow-on plan:**

1. **Wire `WorldEffect.visualEffects` to the executor** — The `visualEffects?: VisualEffectDef[]` fields on all `WorldEffect` variants (`SpawnLightSourceEffect`, `IncrementCounterEffect`, etc.) are currently no-op hooks. Wire them to call `applyVisualEffectDefs` at the position relevant to the world event (victim/killer for `on_unit_died`, etc.) in `WorldModifierRuntime.ts`.

2. **Ability-level `VisualEffectDef` integration** — Allow ability timing emitter defs (`AbilityTimingEmitterDef`) to accept a `visualEffects: VisualEffectDef[]` array in addition to the existing `effectType`/`spriteEffectId` pattern. This lets ability card authors compose effects from shared constants rather than spelling out `effectType` strings.

3. **`DirectEffectVFXDef` positional variants** — Extend the `effect` variant with `position: 'caster' | 'target' | 'midpoint'` for use in world events and ability defs where the spawn position is context-dependent.

### Checklist

- [x] Create `docs/plans/visual-effect-def-followon.plan.md` with the three items above as separate Steps, each with their own Touches and Checklist structure matching this file's format.
  - Created `docs/plans/visual-effect-def-followon.plan.md` with Steps 1–3 covering WorldEffect wiring, AbilityTimingEmitterDef integration, and DirectEffectVFXDef positional variants; each step has Touches, Design, and Checklist sections matching this file's format.
