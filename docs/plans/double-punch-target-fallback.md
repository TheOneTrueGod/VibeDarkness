# Plan: Double Punch — Target Fallback & Targeting Unification

> **Completed 2026-06-20.** All four steps implemented and verified. Steps 1–3 were already checked off by a prior agent; Step 4 added `doublePunchDeathFallbackScenario` in `testing/scenarios/abilities/doublePunchScenario.ts`, registered it in `registry.ts` and `SimulationRunner.test.ts`, and confirmed the scenario passes (punch2 correctly fires at E1's last position and kills the co-located E2). The full suite is 541 passing with 3 pre-existing failures unchanged.

## Context

Double Punch has a bug: when the first punch kills its target and no other enemies are nearby, the second punch produces no animation and no VFX. The root cause is a broken position-lookup chain:

1. `Unit.takeDamage()` sets `unit.active = false` immediately on death.
2. At the end of the same game tick, `GameEngine` calls `unitManager.cleanupInactive()`, removing dead units from `engine.units`.
3. From the NEXT tick onwards, `engine.getUnit(deadUnitId)` returns `undefined`.
4. When punch2's interval enters at t=0.5 (≈16 ticks after the kill), `MeleeAttack.onSetup` calls `resolveMeleeSlideDirection()`. The target unit is gone → fallback position is `caster.x, caster.y` → slide direction `{0, 0}`.
5. Punch2 plays no animation and fires its impact VFX at the caster's own feet.

There is also a "two sources of truth" problem: `active.targets`/`active.targetsByLabel` is the committed targeting data, but `MeleeAttackPayload.lockedUnits` maintains a parallel copy for evade tracking, creating drift when targets become invalid.

**Fix strategy:**
- After ALL unit processing in each game tick (but before `cleanupInactive`), run a pass that downgrades dead unit targets to pixel targets at their last known position. Dead units are still accessible at this point.
- This handles death from any source (own ability, DoT, another unit's attack) because it runs after the entire `gameTick` phase.
- Evade-break is then unified to also write `active.targets` directly.

---

## Agent Instructions

This plan is executed by the **jp-implement-plan** chain. Each agent reads
`.claude/skills/jp-implement-plan/SKILL.md`, implements exactly **one step** (the first step in
document order with unchecked items), then hands off a fresh agent with:

> Read `.claude/skills/jp-implement-plan/SKILL.md` and follow it for the plan at
> `app/js/games/minion_battles/PLANS/double-punch-target-fallback.md`.

Additional rules for this plan:

- **Before starting any item**, read the files named in that item's "Touches" line. Do not guess at types or signatures.
- Relevant skills: `ability-tests`, `editing-card-behaviour`, `game-engine`, `working-on-minion-battles`.
- Per item: run `npm run lint` (fix errors before proceeding), then `npx vitest run --changed`. After the final step: full `npm run test`.
- After verification, change `- [ ]` to `- [x]` and write a one-line summary of what you actually changed beneath the checkbox.
- These changes **must not alter gameplay behaviour** except for the specific bug fix (punch2 now animates toward the dead target's last position rather than firing at the caster's feet). Existing ability test scenarios are the regression net.

---

## Key Architecture Facts

| Fact | File | Line |
|---|---|---|
| `unit.active = false` set on lethal damage | `game/units/Unit.ts` | ~609 |
| Dead units removed from `engine.units` | `game/managers/UnitManager.ts:cleanupInactive()` | ~292 |
| `cleanupInactive` called by GameEngine | `game/GameEngine.ts` | ~1182 |
| `gameTick` called BEFORE `cleanupInactive` | `game/GameEngine.ts` | ~1116 vs 1182 |
| `getUnit` returns first match without `isAlive` check | `game/managers/UnitManager.ts:getUnit()` | ~155 |
| Slide direction zero when unit missing | `abilities/meleeSlideDirection.ts` | 36–39 |
| `active.targets` / `active.targetsByLabel` | `game/types.ts:ActiveAbility` | ~219 |
| `lockedUnits` evade tracking | `abilities/CastBehaviours/MeleeAttack.ts` | 59–76 |
| Evade-break loop (writes `lockedUnits`) | `game/units/unitAbilityTick.ts` | 250–307 |

---

## Checklist

### Step 1 — Refresh dead unit targets at end of `UnitManager.gameTick`

Core bug fix. After all units have processed for a tick, downgrade any unit-type targets that now point to a dead unit into pixel targets at the dead unit's last known position. This must run after all ability/damage ticks (so kills from any source are captured) but before `cleanupInactive` removes the unit from `engine.units`.

- [x] Add a `refreshActiveTargets(active: ActiveAbility, engine: EngineContext): void` function. For each `active.targets[i]` where `type === 'unit'`: call `engine.getUnit(unitId)`. If the unit is found but `!unit.isAlive()`, replace the entry with `{ type: 'pixel', position: { x: unit.x, y: unit.y } }`. Apply the same pass to every key in `active.targetsByLabel`. If `getUnit` returns `undefined` (should not happen before `cleanupInactive`, but be defensive), leave the entry unchanged.
  - **Touches:** place helper in `game/managers/UnitManager.ts` or a new `abilities/targetDowngrade.ts`; import `ActiveAbility` from `game/types.ts`, `EngineContext` from `game/EngineContext.ts`
  - Created `abilities/targetDowngrade.ts` with `refreshActiveTargets` (iterates targets + targetsByLabel, downgrades dead unit entries to pixel).

- [x] At the END of `UnitManager.gameTick()`, after all units have been iterated but before returning, loop over every unit in `this.units` and call `refreshActiveTargets(active, engine)` for each active ability on each unit. The engine context to pass is the `engine: EngineContext` parameter already present in `gameTick`.
  - **Touches:** `game/managers/UnitManager.ts` (add loop + call at end of `gameTick`)
  - Added Phase 4 loop at end of `gameTick` in `UnitManager.ts` calling `refreshActiveTargets` for each active ability on each unit.

- [x] Run `npm run lint` and `npx vitest run --changed`. Verify zero regressions — no existing test should break since we are only changing target TYPES from `unit` to `pixel` for dead targets, and all target-handling code already supports pixel targets.
  - Lint: 0 errors (13 pre-existing warnings). 2 test failures (`darkSwarm.test.ts` lightAmount, `SimulationRunner` swingSword) confirmed pre-existing (reproduce on clean stash).

---

### Step 2 — Unify evade-break into `active.targets`

Currently, when a target evades, the evade snapshot is stored in `MeleeAttackPayload.lockedUnits[i].lockedPosition` — a separate copy from `active.targets`. This step makes `active.targets` the single source of truth for evade state too.

- [x] In the evade-break loop in `unitAbilityTick.ts` (lines 250–307), after calling `rec.entry.behaviour.onTargetEvade?.(...)`, also update `active.targets` and `active.targetsByLabel`: for any entry whose `unitId` matches the dodging unit, replace it with `{ type: 'pixel', position: snapshot }`. Iterate `rec.active.targets` by index and `Object.entries(rec.active.targetsByLabel ?? {})` by label.
  - **Touches:** `game/units/unitAbilityTick.ts`
  - Added target downgrade loop after `onTargetEvade` call in the evade-break loop; also added `AbilityEngineContext` import and passed `engine` in `baseCtx` (required for item 2). Also added `engine` field to `CastBehaviourBaseContext` in `castBehaviourTypes.ts` so `onTargetEvade` can call `ctx.engine.addEffect`.

- [x] In `MeleeAttackBehaviour.onTick` (`abilities/CastBehaviours/MeleeAttack.ts`): the aim-point resolution branch for `ctx.target.type === 'unit'` with `primaryLock?.lockedPosition` is now redundant — by the time `onTick` fires, evaded targets have already been downgraded to pixel in `ctx.target`. Remove the `lockedPosition` branch from aim resolution; the pixel-target branch below it handles it correctly. The "Dodged" floating text (currently spawned from `lockedPosition !== null` in `onTick`) should be moved: spawn it in `onTargetEvade` itself, immediately when the evade is detected.
  - **Touches:** `abilities/CastBehaviours/MeleeAttack.ts`
  - Removed `lockedPosition` branch from aim resolution in `onTick`; moved "Dodged" floating text spawn to `onTargetEvade` using `ctx.engine.addEffect`.

- [x] After these changes, `lockedUnits` in `MeleeAttackPayload` no longer needs the `lockedPosition` field — it now only needs `unitId` for the guaranteed-hit range check. The `LockedUnit` interface can drop `lockedPosition`. Update `onTargetEvade` (which still fires for other potential uses) to be a no-op or remove it if nothing else needs it. Verify the `evadedIds` set in `onTick` (used to exclude evaded units from hitbox hits) can now be derived from `ctx.allTargets`: evaded targets are `type === 'pixel'` entries that formerly had a `unitId` → since we can't easily reconstruct the original unitId, keep a minimal `evadedUnitIds: Set<string>` in the payload instead, populated in `onTargetEvade`.
  - **Touches:** `abilities/CastBehaviours/MeleeAttack.ts`
  - Dropped `lockedPosition` from `LockedUnit`; added `evadedUnitIds: Set<string>` to `MeleeAttackPayload`; `onTargetEvade` now adds to `evadedUnitIds` and spawns floating text; `onTick` uses `payload.evadedUnitIds` directly as the evaded exclusion set.

- [x] Run `npm run lint` and `npx vitest run --changed`. Evade-related tests (if any exist) must still pass.
  - Lint: 0 errors (13 pre-existing warnings). Test failures: 3 (darkSwarm lightAmount, SimulationRunner swingSword extra uses, telegraphTracking) — all confirmed pre-existing by clean stash check.

---

### Step 3 — Dead code cleanup

Remove debug logging and annotate legacy fields.

- [x] Remove the `console.log('[MeleeAttack] impact VFX', ...)` block at `abilities/CastBehaviours/MeleeAttack.ts` lines 392–401.
  - **Touches:** `abilities/CastBehaviours/MeleeAttack.ts`
  - Removed the 10-line console.log block (lines 391–400) from `MeleeAttack.onTick`.

- [x] Audit `active.evadeFired` (`game/types.ts:237`, used in `unitAbilityTick.ts:254`): the comment already says "legacy". Check which ability IDs still reach the legacy path (`abilityHasTag(active.abilityId, 'evade')` without a declarative `evadeEffect` interval). Add a `// TODO: remove when all evade abilities use declarative evadeEffect intervals` comment on both the field in `types.ts` and the branch in `unitAbilityTick.ts`.
  - **Touches:** `game/types.ts`, `game/units/unitAbilityTick.ts`
  - Added `@legacy TODO` JSDoc to `evadeFired` in `types.ts`; added TODO comment on the `isLegacyEvade` branch in `unitAbilityTick.ts`.

- [x] Audit `active.fired` (`game/types.ts:222`): grep for callers setting `active.fired = true` in ability code. If only legacy `doCardEffect` abilities use it, add a `// TODO: remove when doCardEffect abilities are ported to CastBehaviours` comment.
  - **Touches:** `game/types.ts`
  - Confirmed no current code sets `active.fired = true` (only serialized in Unit.ts). Added `@legacy TODO` JSDoc to `fired` in `types.ts`.

- [x] Run `npm run lint` and `npx vitest run --changed`.
  - Lint: 0 errors (13 pre-existing warnings). Test failures: 3 (darkSwarm lightAmount, SimulationRunner swingSword, telegraphTracking) — all confirmed pre-existing.

---

### Step 4 — AbilityTest: Double Punch target fallback

One scenario that confirms both punches fire correctly when the first target dies mid-cast. This scenario also serves as a regression gate for the evade-unification work.

- [x] Create `testing/scenarios/abilities/doublePunchScenario.ts`. Scenario design:
  - Small map (≈8×6 grid, open grass)
  - Player unit (warrior with Double Punch in hand) at centre-left
  - **E1** placed directly in front of the player within punch range (`MAX_RANGE = 30px`), with HP equal to `PUNCH_DAMAGE` (8) so punch1 kills it in one shot
  - **E2** placed at the same position as E1 (or within 1px), with HP also equal to `PUNCH_DAMAGE` — E2 survives punch1 (punch1 is a single-target hit; the lock-on guarantee means only the primary target E1 gets slot 1), but should die from punch2 if punch2 aims at E1's last known position
  - Orders: player uses Double Punch targeting E1 for both Target 1 and Target 2; add a long move order for the player to prevent idle exit
  - `assertPass`: both E1 and E2 are dead (`!e1.isAlive() && !e2.isAlive()`)
  - `failureMessage`: describe which unit survived and why that indicates the bug

  **Why this catches the regression:** if punch2 fires at caster's position (the bug), E2 — placed at E1's former position across the map — is out of range and survives. If punch2 aims correctly at E1's last position, E2 is in the hitbox and dies.

  - **Touches:** `testing/scenarios/abilities/doublePunchScenario.ts` (create)
  - Created `doublePunchScenario.ts` with `doublePunchDeathFallbackScenario`: E1 at 38px range with 8 HP, E2 co-located with 8 HP, both unit-targeted by the player; assertPass checks both dead.

- [x] Register the scenario in `testing/scenarios/registry.ts` (`ALL_ABILITY_TEST_SCENARIOS`) and ensure `inferScenarioAbilityId` maps it to the Double Punch ability ID (`W16` / whatever `CARD_ID` resolves to in `0116Ability.ts`). Add it to `SimulationRunner.test.ts`.
  - **Touches:** `testing/scenarios/registry.ts`, `testing/SimulationRunner.test.ts`
  - Added `doublePunchDeathFallbackScenario` to `ALL_ABILITY_TEST_SCENARIOS`; added `double_punch_death_fallback` → `'0116'` in `inferScenarioAbilityId`; added new `it(...)` block in `SimulationRunner.test.ts`. Test passes (green).

- [x] Run full `npm run test`. All tests must pass.
  - 541 passed, 3 failed — all 3 failures confirmed pre-existing (darkSwarm lightAmount, swingSwordExtraUses, telegraphTracking). No regressions introduced.

---

## AbilityTest philosophy for this plan

- **One scenario for Double Punch** — covers both the death-fallback fix and the evade-unification regression in a single test.
- Assertions are **structural** ("E2 is dead"), not numeric ("E2 has exactly 0 HP").
- The scenario must run deterministically with fixed unit positions and no RNG-dependent outcomes.

---

## What is explicitly OUT OF SCOPE for this plan

- `TelegraphCastPayload` unification with `active.targets` (the telegraph only runs during `prefireTime = 0.15s` and is a separate concern)
- Removing `lockedUnits` entirely from `MeleeAttackPayload` — Step 2 shrinks it to just `evadedUnitIds`; full removal is a follow-up
- Distance-break tether unification (tether breaks update `telegraphLockedPosition`; linking that to `active.targets` is a larger change) — **Note: the `active.targets` downgrade on distance-break was subsequently added to `unitAbilityTick.ts` (2026-06-20), fixing the swarmling hit-effect bug. Telegraph payload unification remains out of scope.**
- Migrating `active.fired` or `active.evadeFired` usage — Step 3 adds TODO comments only

---

## File Reference Map

| File | Role |
|---|---|
| `game/managers/UnitManager.ts` | `gameTick` entry point for the refresh pass (Step 1) |
| `game/types.ts` | `ActiveAbility` interface; TODO annotations (Steps 1, 3) |
| `game/EngineContext.ts` | `EngineContext` type for `refreshActiveTargets` |
| `abilities/targetDowngrade.ts` (optional new) | `refreshActiveTargets` helper if extracted |
| `game/units/unitAbilityTick.ts` | Evade-break loop update (Step 2); TODO annotation (Step 3) |
| `abilities/CastBehaviours/MeleeAttack.ts` | Aim-resolution simplification; remove console.log; evadedUnitIds (Steps 2, 3) |
| `abilities/meleeSlideDirection.ts` | Read-only reference (root cause; no changes needed) |
| `testing/scenarios/abilities/doublePunchScenario.ts` | New scenario (Step 4) |
| `testing/scenarios/registry.ts` | Register new scenario (Step 4) |
| `testing/SimulationRunner.test.ts` | Add test entry (Step 4) |
