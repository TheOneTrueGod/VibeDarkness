# Plan: HitboxSpec + Per-Timing Target Definitions

**Goal:** Eliminate the class of bugs where targeting-preview range and actual hit-detection range
can drift apart. Replace the scattered `HitboxDef` plain-object + manual `renderTargetingPreview`
pattern with a single `HitboxSpec` class that owns rendering, lock-on resolution, and hit
resolution. Simultaneously move target acquisition from the ability-level `targets[]` array to
per-timing `targetDef` fields, so the connection between "when does this timing fire" and "which
target does it use" is explicit and co-located.

---

## Agent Instructions

**Before starting any item**, read this file in full, then read the files listed in that item's
"Touches" line. Do not guess at types or function signatures — check the source first.

**After implementing an item:**
1. Run `npm test -- --run` from the project root and confirm the relevant tests pass.
2. Check the item off (change `- [ ]` to `- [x]`).
3. Write a one-line summary of what you actually changed beneath the checkbox.

Hand off one item at a time. Never modify files outside the listed "Touches" for an item without
noting it explicitly.

---

## New Vocabulary

| Term | Meaning |
|---|---|
| `HitboxSpec` | New abstract class (client-side only). Single source of truth for a hitbox: owns rendering, target resolution, and hit resolution. |
| `SelectTargetDef` | A timing variant meaning "the player must click to select a target using this hitbox". |
| `HitTargetDef` | A timing variant meaning "reuse a target already selected by a prior `SelectTargetDef` timing". |
| `TimingTargetDef` | Discriminated union of `SelectTargetDef \| HitTargetDef`. |
| `targetsByLabel` | `Record<string, ResolvedTarget>` on `ActiveAbility`, keyed by the `label` from `SelectTargetDef`. Parallel to (and never replaces) `targets[]` for backward compat. |

---

## Key Interfaces (reference while implementing)

```typescript
// abilities/timingTargetDef.ts  (NEW FILE — Step 1)

/** Player clicks to select a target via this hitbox. */
export interface SelectTargetDef {
    kind: 'select';
    label: string;           // unique within the ability; used to reference this target later
    hitbox: HitboxSpec;      // single source of truth for range, rendering, resolution
    filter: 'enemy' | 'ally' | 'any';
    allowMiss?: boolean;     // true = pixel fallback; false = invalid click; default true
}

/** Reuse a target that was committed by an earlier SelectTargetDef timing. */
export interface HitTargetDef {
    kind: 'hit';
    labels: string[];        // labels from SelectTargetDef entries; first match wins for ctx.target
}

export type TimingTargetDef = SelectTargetDef | HitTargetDef;

// ---- helpers ----
export function isSelectTargetDef(d: TimingTargetDef): d is SelectTargetDef { return d.kind === 'select'; }
export function isHitTargetDef(d: TimingTargetDef): d is HitTargetDef    { return d.kind === 'hit'; }
```

```typescript
// hitboxes/HitboxSpec.ts  (NEW FILE — Step 2)

export abstract class HitboxSpec {
    /** Effective max range in px (already includes any unit-radius padding). */
    abstract get maxRange(): number;

    /**
     * Render the targeting overlay for the in-progress target selection.
     * Returns the units that would be highlighted — callers do not need to re-query.
     */
    abstract renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): Unit[];

    /**
     * Resolve which units are in the hitbox at click/commit time (lock-on candidates).
     * Same geometry as renderTargetingPreview — guaranteed not to drift.
     */
    abstract resolveTargets(
        caster: Unit,
        aimPoint: { x: number; y: number },
        units: Unit[],
    ): Unit[];

    /**
     * Resolve actual hits at impact time.
     * lockOnId: if provided, that unit gets guaranteed-hit treatment (priority + tether).
     */
    abstract resolveHits(
        engine: HitboxEngineContext,
        caster: Unit,
        aimX: number,
        aimY: number,
        lockOnId?: string,
    ): Unit[];
}
```

```typescript
// abilities/abilityTimings.ts  (EXTENDED — Step 3)
// New optional fields on AbilityTimingInterval:
//   targetDef?: TimingTargetDef
//   behaviour?: CastBehaviour   (shorthand for a single castBehaviours entry spanning full window)
```

```typescript
// game/types.ts  (EXTENDED — Step 4)
// New optional field on ActiveAbility:
//   targetsByLabel?: Record<string, ResolvedTarget>
```

---

## Checklist

### Step 1 — Create `abilities/timingTargetDef.ts`
- [x] New file with `SelectTargetDef`, `HitTargetDef`, `TimingTargetDef`, and the two type-guard helpers.
  - Created `abilities/timingTargetDef.ts` with all four exports; imports `HitboxSpec` as a type (forward reference, resolved in Step 2).
  - **Touches:** `abilities/timingTargetDef.ts` (create)
  - No other files change.
  - No runtime behaviour changes; purely additive types.

---

### Step 2 — Create `hitboxes/HitboxSpec.ts` + `MeleeLineHitboxSpec`
- [x] Abstract `HitboxSpec` class with `maxRange`, `renderTargetingPreview`, `resolveTargets`, `resolveHits`.
  - Created `hitboxes/HitboxSpec.ts` with `HitboxSpec` abstract class, `MeleeLineHitboxSpec`, `meleeLineHitbox` factory, and re-exported all three from `hitboxes/index.ts`. `MeleeLineHitboxSpec` delegates rendering to `ThickLineHitbox.renderTargetingPreview`, uses the same clamped-line geometry for `resolveTargets`, and calls `resolveHitbox` (subtracting back `DEFAULT_UNIT_RADIUS`) for `resolveHits`. `meleeLineHitbox` bakes in `+ DEFAULT_UNIT_RADIUS` to stored `maxRange`.
- [x] `MeleeLineHitboxSpec extends HitboxSpec`: implements all four using `ThickLineHitbox` and `resolveHitbox` internally.
- [x] Factory `meleeLineHitbox(maxRange: number, thickness: number): MeleeLineHitboxSpec`
  - Bakes in `+ DEFAULT_UNIT_RADIUS` so callers can never forget.
- [x] Re-export from `hitboxes/index.ts`.
  - **Touches:** `hitboxes/HitboxSpec.ts` (create), `hitboxes/index.ts`
  - `MeleeLineHitboxSpec.renderTargetingPreview` must return the highlighted `Unit[]` (not void) so callers can read the list without re-querying.
  - `MeleeLineHitboxSpec.resolveTargets` uses the same geometry as `renderTargetingPreview` (no separate code path).
  - `MeleeLineHitboxSpec.resolveHits` calls the existing `resolveHitbox` with `priorityUnitId = lockOnId`.

---

### Step 3 — Extend `AbilityTimingInterval` with `targetDef` and `behaviour`
- [x] Add `targetDef?: TimingTargetDef` and `behaviour?: CastBehaviour` to `AbilityTimingInterval` in `abilities/abilityTimings.ts`.
  - Added both optional fields to `AbilityTimingInterval` with JSDoc comments; imported `TimingTargetDef` from `timingTargetDef.ts` and `CastBehaviour` from `castBehaviourTypes.ts`; updated both warning comments in `applyCoopTailSplit` (the outer docblock and the `evadeEffect` field comment) to list `targetDef` and `behaviour`.
- [x] Import `TimingTargetDef` from `abilities/timingTargetDef.ts` and `CastBehaviour` from `abilities/castBehaviourTypes.ts`.
- [x] `applyCoopTailSplit` already documents that it does NOT carry custom fields through split intervals — add `targetDef` and `behaviour` to that warning comment.
  - **Touches:** `abilities/abilityTimings.ts`
  - No runtime behaviour changes yet.

---

### Step 4 — Add `targetsByLabel` to `ActiveAbility`
- [x] Add `targetsByLabel?: Record<string, ResolvedTarget>` to `ActiveAbility` in `game/types.ts`.
  - Added `targetsByLabel?: Record<string, ResolvedTarget>` to `ActiveAbility` with a JSDoc comment noting it coexists with `targets[]` and is NOT serialized.
  - **Touches:** `game/types.ts`
  - This field is NOT serialized (same as `castBehaviourPayloads`). Document that with a comment.
  - `targets[]` stays unchanged; both coexist.

---

### Step 5 — Runtime: resolve targets from `timing.targetDef` in `unitAbilityTick.ts`
- [x] In the `castBehaviours` enter/tick/exit loops, after resolving `targetIdx`, also check if the
  timing interval has a `targetDef`:
  - `kind: 'select'` → look up `active.targetsByLabel?.[targetDef.label]`; fall back to `active.targets[0]`.
  - `kind: 'hit'` → look up the first matching label from `active.targetsByLabel`; fall back to `active.targets[0]`.
  - Added `resolveTargetForBehaviour` helper in `unitAbilityTick.ts`; updated all four castBehaviour loops (enter, exit sustained, per-tick, evade-break). Also updated `cleanupCastBehavioursForAbility` in `Unit.ts` for interrupt/cancel path.
- [x] Handle the new `timing.behaviour` shorthand: if a timing has `behaviour` but no `castBehaviours`,
  treat it as if `castBehaviours = [{ timingStart: 'start', timingEnd: 'end', behaviour: timing.behaviour }]`.
  The target for this synthetic entry is resolved via `timing.targetDef` (above).
  - Added `getEffectiveCastBehaviours` helper that returns `interval.castBehaviours` if present, or synthesizes a single entry from `interval.behaviour`, or returns `undefined`.
  - **Touches:** `game/units/unitAbilityTick.ts`, `game/units/Unit.ts` (added `targetDef?` to `activeCastBehaviours` record type; updated interrupt cleanup)
  - Keep the existing `targetIndex`-based path for all timings that do NOT have `targetDef`. ✓
  - Do not remove or break any existing ability behaviour. ✓ (lint, tsc, and vitest --changed all pass; pre-existing earth-core failures unchanged)

---

### Step 6 — Input: populate `targetsByLabel` in `BattlePhase.tsx`
- [x] Add a helper `getSelectTargetDefsFromTimings(ability): SelectTargetDef[]` in `abilities/targeting.ts`
  that scans `ability.abilityTimings` for intervals with `targetDef.kind === 'select'`, in declaration
  order. This gives the ordered click sequence for new-style abilities.
  - Scans raw timing entries (before normalization) so `targetDef` fields are never stripped by `applyCoopTailSplit`.
- [x] In `BattlePhase.tsx`, when an ability has `getSelectTargetDefsFromTimings(ability).length > 0`,
  use those instead of `getAbilityTargets(ability)` to drive the target-collection loop.
  - Each `selectTarget.hitbox` is used for the lock-on cache query (replacing `resolveHitbox(targetDef.lockOn.hitbox, ...)`).
  - `selectTarget.hitbox.resolveTargets(caster, aimPoint, units)` replaces the inline `resolveHitbox` call for the mouse-move cache.
- [x] On click commit, write the resolved target into both `currentTargets` (positional, for `targets[]` compat)
  AND a new `targetsByLabel` map keyed by `selectTargetDef.label`.
- [x] When the order is submitted, attach `targetsByLabel` to the `BattleOrder` targets payload so
  `GameEngine` can populate `ActiveAbility.targetsByLabel` on the active ability.
  - Added `targetsByLabel?` to `BattleOrder` in `game/types.ts` (extra touch).
  - Updated `OrderManager.applyOrderLogic` in `game/managers/OrderManager.ts` to set `active.targetsByLabel` from the order after `executeAbility` (extra touch).
  - **Touches:** `abilities/targeting.ts`, `ui/pages/BattlePhase.tsx`
  - Extra touches: `game/types.ts` (BattleOrder field), `game/managers/OrderManager.ts` (populaltes active.targetsByLabel)
  - Fall back to the existing `getAbilityTargets` path for abilities that still use `targets[]` only.

---

### Step 7 — Renderer: auto-derive `renderTargetingPreview` from `selectTarget.hitbox`
- [x] In `GameRenderer.ts` ghost-preview path: if the ability has `selectTarget` timings (Step 6 helper)
  and the current number of collected targets maps to one of those timings, call
  `selectTarget.hitbox.renderTargetingPreview(gr, unit, mouseWorld, engine.units)` automatically.
  - Widened `targetingState.selectedAbility` and `render()` parameter type from a narrow `{ renderTargetingPreview? }` shape to `AbilityStatic | null`; imported `AbilityStatic` and `getSelectTargetDefsFromTimings`. In `renderTargetingPreview`: calls `selectDef.hitbox.renderTargetingPreview(gr, caster, mouseWorld, engine.units)` for the current target slot (index = `currentTargets.length`), plus legacy `renderTargetingPreviewSelectedTargets` for already-committed targets; new-style path returns early. In `renderGhostPreviews`: for pending orders on new-style abilities, loops over committed targets and renders each hitbox using that target's world position.
- [x] Only fall through to `ability.renderTargetingPreview` if the ability does NOT have `selectTarget`
  timings (i.e., it is a legacy-style ability).
  - **Touches:** `game/GameRenderer.ts`
  - New-style abilities no longer need `renderTargetingPreview` defined on them.

---

### Step 8 — Migrate punch abilities to the new system (0116–0120)
- [x] For each of `0116_DoublePunch`, `0117_StrongPunch`, `0118_SneakyPunch`, `0119_ChargingPunch`, `0120_PunchNEW`:
  - Replaced `const PUNCH_HITBOX: HitboxDef = { shape: 'meleeLine', range: MAX_RANGE, ... }` with `const PUNCH_HITBOX = meleeLineHitbox(MAX_RANGE, LINE_THICKNESS)` in all five files.
  - Replaced `targets: [TARGET_DEF]` / `castBehaviours: [{ targetIndex: 0, behaviour }]` with per-timing `targetDef: { kind: 'select', label: 'Target', hitbox: PUNCH_HITBOX, filter: 'enemy', allowMiss: true }` + `behaviour` shorthand. For `0116_DoublePunch`: punch1 uses `label: 'Target 1'`, punch2 uses `label: 'Target 2'`.
  - Removed `renderTargetingPreview` from all five abilities (auto-derived by renderer).
  - Replaced `getRange` manual `caster.radius` arithmetic with `PUNCH_HITBOX.maxRange`; set `targets: []`.
  - Removed unused imports (`HitboxDef`, `TargetDef`, `ThickLineHitbox`, `getAimPointClampedToMaxRange`, `buildHitboxContext`, `renderMeleeTrackingHighlights`, `DEFAULT_UNIT_RADIUS`, `IAbilityPreviewGraphics`, `ResolvedTarget`).
  - `npm run lint` shows no new errors in 0116–0120 files. `npx vitest run --changed` passes all non-pre-existing tests.
  - **Touches:** `0116_DoublePunch/0116Ability.ts`, `0117_StrongPunch/0117Ability.ts`,
    `0118_SneakyPunch/0118Ability.ts`, `0119_ChargingPunch/0119Ability.ts`, `0120_PunchNEW/0120Ability.ts`

---

### Step 9 — Ability tests: melee hitbox spec coverage
- [x] In `testing/scenarios/abilities/punchResearch.ts`, add:
  - **`bash_range_boundary_hit`** — Places a dummy at exactly `MAX_RANGE + DEFAULT_UNIT_RADIUS - 1` px
    from the player. Bash (0120) is used. Assert: dummy took damage.
    _(Regression test: this dummy was previously not highlighted and not hit due to the range mismatch.)_
  - **`bash_range_boundary_miss`** — Places a dummy at `MAX_RANGE + DEFAULT_UNIT_RADIUS + 5` px.
    Bash is used. Assert: dummy took no damage.
    _(Confirms the out-of-range case is actually a miss, not just an accidental hit.)_
  - **`double_punch_two_targets`** — Places two dummies side by side. DoublePunch (0116) is submitted
    with two separate target pixels, one for each dummy. Assert: both dummies took damage.
    _(Validates per-timing `selectTarget` routing — each timing gets its own target.)_
  - **Touches:** `testing/scenarios/abilities/punchResearch.ts`
  - Do NOT add detailed damage-number assertions (these are E2E, not unit tests).

---

## What is explicitly OUT OF SCOPE for this plan

- Migrating any ability outside the punch family (0116–0120) to `targetDef`/`behaviour`.
- The "single click → multiple auto-targets" (`hitTarget: ['A', 'B', 'C']` from one click) feature.
- Any changes to AI targeting (`buildResolvedTargets` in `unitAI/utils.ts`) — AI continues to use `active.targets[]`.
- Renaming the existing `HitboxDef` plain-object union type or removing it.
- Cone or circle variants of `HitboxSpec` (only `MeleeLineHitboxSpec` is in scope).

---

## File Reference Map

| File | Role |
|---|---|
| `abilities/timingTargetDef.ts` | NEW — type definitions |
| `hitboxes/HitboxSpec.ts` | NEW — abstract class + `MeleeLineHitboxSpec` + factory |
| `hitboxes/index.ts` | Re-export `HitboxSpec`, `MeleeLineHitboxSpec`, `meleeLineHitbox` |
| `abilities/abilityTimings.ts` | Add `targetDef?` and `behaviour?` to `AbilityTimingInterval` |
| `game/types.ts` | Add `targetsByLabel?` to `ActiveAbility` |
| `game/units/unitAbilityTick.ts` | Resolve targets from `targetsByLabel`; handle `timing.behaviour` shorthand |
| `abilities/targeting.ts` | Add `getSelectTargetDefsFromTimings()` helper |
| `ui/pages/BattlePhase.tsx` | Populate `targetsByLabel`; use `hitbox.resolveTargets()` for lock-on |
| `game/GameRenderer.ts` | Auto-derive preview from `selectTarget.hitbox.renderTargetingPreview()` |
| `0116–0120 Ability files` | Migrate to `meleeLineHitbox` + `targetDef` + `behaviour` |
| `testing/scenarios/abilities/punchResearch.ts` | Add 3 new scenario definitions |
