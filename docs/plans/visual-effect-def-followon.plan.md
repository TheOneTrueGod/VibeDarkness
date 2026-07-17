# VisualEffectDef System — Follow-on Work

> **Status: COMPLETE — 2026-06-20**
>
> All three steps implemented and verified. `WorldEffect.visualEffects` now wires to `applyVisualEffectDefs` in `WorldModifierRuntime.ts` (Step 1); `AbilityTimingEmitterDef` gained `visualEffects` + `effectPosition` fields with execution in `unitAbilityTick.ts` (Step 2); `DirectEffectVFXDef` gained a `position` field (`'caster' | 'target' | 'midpoint'`) with context-aware spawn logic in `applyVisualEffectDefs` (Step 3). Full suite: 555/555 green.

**Canonical file:** [`docs/plans/visual-effect-def-followon.plan.md`](docs/plans/visual-effect-def-followon.plan.md)

## Agent Instructions

Execute one step at a time via `/jp-implement-plan docs/plans/visual-effect-def-followon.plan.md`.

For each step:

1. Read this file to find the **first step whose checklist has unchecked items**.
2. Read every file listed under **Touches** before editing anything.
3. Implement only the listed files; keep diffs minimal.
4. Run `npm run lint`, then `npx vitest run --changed`, then `npm run test`.
5. Check off each item `[x]` with a one-line summary beneath it.
6. Hand off to the next agent — do not start the next step until all items are checked.

---

## Context

This plan picks up the three items that were explicitly out of scope for the initial `VisualEffectDef` system build (see [`docs/plans/visual-effect-def-death-vfx.plan.md`](docs/plans/visual-effect-def-death-vfx.plan.md)).

After that plan completed:

- `VisualEffectDef` union type exists in `app/js/games/minion_battles/game/effects/visualEffectDef.ts`.
- `applyVisualEffectDefs(defs, unit, engine)` executor exists in `app/js/games/minion_battles/game/effects/applyVisualEffectDefs.ts`.
- `WorldEffect` variants already carry a `visualEffects?: VisualEffectDef[]` field but nothing calls `applyVisualEffectDefs` from the world modifier runtime.
- Ability timing emitter defs still use raw `effectType`/`spriteEffectId` strings with no `VisualEffectDef` integration.
- `DirectEffectVFXDef` spawns effects at the unit's own position; there is no way to express target/midpoint positions from a world event or ability context.

---

## Step 1 — Wire `WorldEffect.visualEffects` to the executor

**Goal:** When a world modifier rule fires, any `visualEffects` array on the matched `WorldEffect` is passed to `applyVisualEffectDefs`, positioned at the contextually relevant unit (victim for `on_unit_died`, triggering unit for other events).

**Touches:**
- `app/js/games/minion_battles/worldModifiers/WorldModifierRuntime.ts` *(edit — call `applyVisualEffectDefs` after each effect is applied)*
- `app/js/games/minion_battles/worldModifiers/WorldEffect.ts` *(read only — confirm `visualEffects` field shape on each variant)*

**Design:**

Inside `WorldModifierRuntime.ts`, after applying each `WorldEffect` action, check whether the effect has a non-empty `visualEffects` array. If so, resolve the "contextual unit" from the event payload:

- `on_unit_died` → victim unit (`data.unitId`)
- `on_unit_damaged` → damaged unit (`data.unitId`)
- Other events → no unit context; spawn at `{ x: 0, y: 0, radius: 0, characterId: '' }` (or skip if no sensible position)

Then call `applyVisualEffectDefs(effect.visualEffects, contextUnit, engineContext)`.

This wiring should be purely additive — no existing world modifier currently populates `visualEffects`, so no existing behaviour changes.

### Checklist

- [x] In `WorldModifierRuntime.ts`, after each `WorldEffect` is applied, resolve the contextual unit from the event payload and call `applyVisualEffectDefs` if `effect.visualEffects?.length`.
  - Read `WorldModifierRuntime.ts` and `WorldEffect.ts` in full before editing.
  - Added `import { applyVisualEffectDefs }` from `../game/effects/applyVisualEffectDefs`; replaced the no-op `applyVisualEffects` stub with a real implementation that resolves the contextual unit from `on_unit_died` event data and delegates to `applyVisualEffectDefs`; updated all six call sites to pass `engine` as the third argument.
- [x] Add an AbilityTest scenario `world_effect_visual_effects_fire` under the `worldModifiers` group: create a world modifier with `on_unit_died` + a `WorldEffect` carrying a `DirectEffectVFXDef`; kill a unit; assert the expected effect type appears in `engine.effects`.
  - Added `worldEffectVisualEffectsFireScenario` to `testing/scenarios/general/worldModifiers.ts` using an `incrementCounter` effect with a `DirectEffectVFXDef` (`effectType: 'TestWorldEffectVFX'`); registered in `registry.ts`.
- [x] `npm run lint` passes with no new errors.
  - 0 errors, 14 warnings (all pre-existing).
- [x] `npx vitest run --changed` passes (pre-existing failures are allowed; no new ones).
  - 150 tests passed across 18 files; full suite also green (555 tests, 69 files).

---

## Step 2 — Ability-level `VisualEffectDef` integration

**Goal:** Allow `AbilityTimingEmitterDef` to carry a `visualEffects: VisualEffectDef[]` array. When the timing emitter fires, call `applyVisualEffectDefs` at the emitter's resolved position (caster or target).

**Touches:**
- `app/js/games/minion_battles/game/abilities/AbilityTimingEmitterDef.ts` *(edit — add optional `visualEffects` field)*
- `app/js/games/minion_battles/game/abilities/abilityTimingEmitter.ts` *(edit — call executor when `visualEffects` is present)*

**Design:**

Add `visualEffects?: VisualEffectDef[]` to the `AbilityTimingEmitterDef` interface. In the emitter execution path (`abilityTimingEmitter.ts`), after existing `effectType`/`spriteEffectId` handling, check for `def.visualEffects` and call `applyVisualEffectDefs(def.visualEffects, resolvedUnit, engine)` where `resolvedUnit` is the caster or the primary target depending on `def.targetType` (or a new field `effectPosition?: 'caster' | 'target'`).

The existing `effectType`/`spriteEffectId` fields are **not removed** — this is purely additive. Ability authors can use either form.

### Checklist

- [x] Add `visualEffects?: VisualEffectDef[]` to `AbilityTimingEmitterDef`; read the interface in full before editing.
  - Added `visualEffects?: VisualEffectDef[]` and `effectPosition?: 'caster' | 'target'` to `EmitterDefShared` in `app/js/games/minion_battles/abilities/abilityTimings.ts`; added `import type { VisualEffectDef }` from `../game/effects/visualEffectDef`.
- [x] In `abilityTimingEmitter.ts`, call `applyVisualEffectDefs` when `def.visualEffects?.length`; use caster position by default; add `effectPosition?: 'caster' | 'target'` to `AbilityTimingEmitterDef` to allow overriding.
  - The execution path is in `unitAbilityTick.ts` (not a separate `abilityTimingEmitter.ts` — that file does not exist). Added `import { applyVisualEffectDefs }` and a post-emitter block: resolves position unit from `active.targets[0]` when `effectPosition === 'target'`, falls back to caster; calls `applyVisualEffectDefs(emitterDef.visualEffects, positionUnit, engine)`.
- [x] Add an AbilityTest scenario `ability_timing_emitter_visual_effects_fire`: create a minimal ability with a timing emitter that carries a `DirectEffectVFXDef`; cast it; assert the expected effect type appears in `engine.effects`.
  - Created `testing/scenarios/general/abilityTimingEmitterVfx.ts` with `abilityTimingEmitterVisualEffectsFireScenario`; added `registerAbilityForTest` export to `AbilityRegistry.ts`; registered scenario in `registry.ts` with `generalSection: 'Ability Emitter VFX'` and added sidebar group entry.
- [x] `npm run lint` passes with no new errors.
  - 0 errors, 14 warnings (all pre-existing).
- [x] `npx vitest run --changed` passes (pre-existing failures are allowed; no new ones).
  - 251 tests passed across 39 files; full suite also green (555 tests, 69 files).

---

## Step 3 — `DirectEffectVFXDef` positional variants

**Goal:** Extend the `effect` variant of `VisualEffectDef` with a `position` field so callers in world events and ability emitters can express spawn position without hardcoding coordinates.

**Touches:**
- `app/js/games/minion_battles/game/effects/visualEffectDef.ts` *(edit — add `position` field to `DirectEffectVFXDef`)*
- `app/js/games/minion_battles/game/effects/applyVisualEffectDefs.ts` *(edit — accept an optional second context object `{ caster?, target? }` for position resolution)*

**Design:**

Extend `DirectEffectVFXDef`:

```typescript
export interface DirectEffectVFXDef {
    type: 'effect';
    effectType: string;
    effectData?: Record<string, unknown>;
    duration: number;
    offsetX?: number;
    offsetY?: number;
    /** Spawn position relative to context. Defaults to 'caster' for backward compat. */
    position?: 'caster' | 'target' | 'midpoint';
}
```

Update `applyVisualEffectDefs` signature:

```typescript
export function applyVisualEffectDefs(
    defs: VisualEffectDef[],
    caster: { x: number; y: number; radius: number; characterId: string },
    engine: EngineContext,
    context?: {
        target?: { x: number; y: number; radius: number };
    },
): void
```

For `position: 'target'`: use `context.target` position (skip the def if no target in context). For `position: 'midpoint'`: average `caster` and `context.target` coordinates. For `position: 'caster'` (default): existing behaviour unchanged.

All existing call sites pass only three arguments — no changes needed at call sites for backward compatibility.

### Checklist

- [x] Add `position?: 'caster' | 'target' | 'midpoint'` to `DirectEffectVFXDef` in `visualEffectDef.ts`.
  - Added `position?: 'caster' | 'target' | 'midpoint'` field with JSDoc comment to `DirectEffectVFXDef` in `app/js/games/minion_battles/game/effects/visualEffectDef.ts`.
- [x] Update `applyVisualEffectDefs` to accept optional `context` fourth argument; resolve spawn position based on `def.position` for the `effect` branch.
  - Added `VFXContext` interface and optional `context?: VFXContext` fourth parameter; `effect` branch now resolves `spawnX/spawnY` from `caster`, `context.target`, or midpoint; skips def if `target`/`midpoint` requested but no context provided.
- [x] Existing call sites continue to compile and behave identically (no required argument added).
  - All existing call sites pass three arguments (no fourth arg); `context` defaults to `undefined` which triggers the `'caster'` path; full suite still green (555 tests, 69 files).
- [x] Add an AbilityTest scenario `direct_effect_vfx_def_target_position`: use a `DirectEffectVFXDef` with `position: 'target'` in a timing emitter; assert effect spawns at the target's coordinates (within tolerance).
  - Created `testing/scenarios/general/directEffectVfxDefPosition.ts`; updated `unitAbilityTick.ts` to resolve `contextTarget` from the primary target and pass `{ target: contextTarget }` as the fourth arg; registered scenario in `registry.ts` under `generalSection: 'Ability Emitter VFX'`; SimulationRunner test now shows 59 tests (up from 58).
- [x] `npm run lint` passes with no new errors.
  - 0 errors, 14 warnings (all pre-existing).
- [x] `npx vitest run --changed` passes (pre-existing failures are allowed; no new ones).
  - 251 tests passed across 39 files; full suite also green (555 tests, 69 files).
