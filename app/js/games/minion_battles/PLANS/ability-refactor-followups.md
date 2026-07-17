# Plan: Ability Refactor Follow-ups

> **STATUS (2026-06-11):** Steps 1–8 complete; 516 tests green. Step 9 (StoneTomb/Knock/ThrowTorch
> → ProjectileLaunch) was not run — items deferred to `docs/TODO.md` (Medium category).

**Goal:** Close out the follow-ups identified in the post-implementation review of
`PLANS/done/ability-boilerplate-reduction.md`. Fix the permanently-red test so the chain has a
real green gate, finish the declarative-damage story (single source of truth for amount dealt,
typed attack types, per-unit damage resolver, delete the deprecated overload), make
`onAttackBlocked` optional at the contract level, clean up the `0534` deviation, wire the
SpriteEffect system into the declarative surfaces, and run the next migration wave
(enemy melee/archer, BeastClaw quad hitbox, remaining throw-pattern cards).

An ability file should read as a declaration of **what the ability is** (numbers, shapes, riders),
not how the engine executes it.

---

## Agent Instructions

This plan is executed by the **jp-implement-plan** chain: each agent reads
`.claude/skills/jp-implement-plan/SKILL.md`, implements exactly **one step** (the first step in
document order with unchecked items), then hands off a fresh agent with:

> Read `.claude/skills/jp-implement-plan/SKILL.md` and follow it for the plan at
> `app/js/games/minion_battles/PLANS/ability-refactor-followups.md`.

Additional rules for this plan:

- **Before starting any item**, read the files in that item's "Touches" line. Do not guess at
  types or signatures.
- Relevant skills: `editing-card-behaviour`, `creating-an-ability`, `working-with-hitboxes`,
  `ability-tests`, `game-engine`.
- Per item: run `npm run lint`, then `npx vitest run --changed`. After the step: full
  `npm run test`. **After Step 1 lands, the full suite must be green — there is no "pre-existing
  failure" allowance in this plan.** If you arrive at a step and the suite is red, stop and
  report instead of building on top of it.
- After verification, change `- [ ]` to `- [x]` and write a one-line summary of what you actually
  changed beneath the checkbox. Note any files touched outside the "Touches" line.
- Migration steps must **not change gameplay behaviour** unless the item explicitly says so.
  Existing AbilityTest scenarios are the regression net — if one fails, the migration is wrong,
  not the scenario.
- Card file paths below are relative to `app/js/games/minion_battles/`. Verify paths with a glob
  before editing — folder names drift in this legacy codebase.

---

## Vocabulary

| Term | Meaning |
|---|---|
| `DamageOutcome` | New return type of `tryDamageOrBlock`: `{ hit: boolean; amountDealt: number }` (`amountDealt` is 0 when blocked). |
| Damage resolver | Third `withDamage` form: `withDamage((ctx, unit) => number)` — per-unit amount computed at impact, fed through the same declarative pipeline. |
| `ConvexQuadHitbox` | New `HitboxSpec` subclass for the square-in-front melee shape currently hand-rolled in BeastClaw / AlphaWolfClaw. |
| Throw pattern | The Step-14 shape from the previous plan: `CastBehaviours.ProjectileLaunch()` on an Active interval, impact via `onProjectileExpired` / `ON_PROJECTILE_EXPIRED`. |

---

## Key Interfaces (reference while implementing)

```typescript
// abilities/blockingHelpers.ts (Step 2)
export interface DamageOutcome {
    hit: boolean;
    /** Post-attacker-modifier damage passed to takeDamage. 0 when blocked.
     *  NOTE: defender-side modifiers (exposed +20%, armour absorption) apply inside
     *  takeDamage and are NOT reflected here. */
    amountDealt: number;
}
export function tryDamageOrBlock(defender: Unit, params: TryDamageOrBlockParams): DamageOutcome;
```

```typescript
// abilities/CastBehaviours/MeleeAttack.ts + BaseAttackBehaviour.ts (Steps 2–3)
withDamage(amount: number, opts?: { attackType?: TryDamageOrBlockParams['attackType'] }): this;
withDamage(resolver: (ctx: CastBehaviourTickContext, unit: Unit) => number,
           opts?: { attackType?: TryDamageOrBlockParams['attackType'] }): this;
// The legacy withDamage(fn: (ctx, hitUnits) => void) overload is DELETED in Step 3.
```

```typescript
// abilities/Ability.ts (Step 4)
// onAttackBlocked becomes optional on AbilityStatic:
onAttackBlocked?(engine: unknown, defender: Unit, attackInfo: AttackBlockedInfo): void;
// All invocation sites switch to: ability.onAttackBlocked?.(...)
```

```typescript
// hitboxes/ConvexQuadHitbox.ts (Step 8)
// HitboxSpec subclass: rectangle projected in front of the caster toward the aim point.
// Factory bakes in unit-radius padding like meleeLineHitbox:
export function convexQuadHitbox(reach: number, width: number, numTargets?: number): ConvexQuadHitbox;
```

---

## Checklist

### Step 1 — Green gate: fix the permanently-red `damageModifiers.test.ts`

- [x] Investigate why `abilities/damageModifiers.test.ts` fails (it was reported as a
  "pre-existing failure" through the entire previous plan chain). Determine whether the test
  encodes intended behaviour (fix the code) or stale expectations (fix the test). If the answer
  is genuinely ambiguous — e.g. a tuning question — stop and ask the user with concrete options
  rather than guessing.
  - **Touches:** `abilities/damageModifiers.test.ts`, `abilities/damageModifiers.ts` (read first; edit whichever side is wrong)
  - Stale test: mock attacker omitted `stackSize`; `getModifiedAbilityDamage` multiplies by `attacker.stackSize`, so the result was `NaN` vs expected `11`. Fixed by adding `stackSize: 1` to the mock (commit `860230f`; implementation unchanged).
- [x] Run the full suite and confirm it is **entirely green**. Record the result in the summary —
  every later step depends on this gate.
  - `npm run lint` clean (0 errors); `npx vitest run --changed` + full suite: **515 tests passed** (64 files), 2026-06-11.

---

### Step 2 — `tryDamageOrBlock` returns `DamageOutcome`; typed attack types

- [x] Change `tryDamageOrBlock` to return `DamageOutcome` (see Key Interfaces): on hit, return the
  `modifiedDamage` it already computes internally; on block, `{ hit: false, amountDealt: 0 }`.
  Update **all** call sites mechanically (boolean uses become `.hit`):
  behaviours/templates/helpers — `CastBehaviours/BaseAttackBehaviour.ts`,
  `CastBehaviours/DashBehaviour.ts`, `templates/ChargeAttack.ts`,
  `templates/MultiChargeAttack.ts`, `targetHelpers.ts` (`damageEnemiesInCircle`) — and card files
  `0534_DiggingClaws`, `0103_SwingBat`, `0115_SwingBat`, `0611_BeastClaw`, `0526_Shatter`,
  `0524_EarthernPunch`, `0004_AlphaWolfClaw`, `0002_EnemyMeleeAttack`.
  - **Touches:** `abilities/blockingHelpers.ts` + the 13 caller files listed above
  - Grep for `tryDamageOrBlock(` before starting — the list above may have drifted.
  - Added `DamageOutcome` interface; return `{ hit, amountDealt }` from `blockingHelpers.ts`. Updated 11 callers to use `.hit` (0103/0115/0524/0526/0002/targetHelpers ignore return value — no change needed).
- [x] In `BaseAttackBehaviour.runDeclarativeDamage`, delete the duplicate
  `getModifiedAbilityDamage` computation and pass `outcome.amountDealt` to the `onDamage` hook.
  Remove the now-unused `getModifiedAbilityDamage` / `getAbility` imports if nothing else uses
  them there.
  - **Touches:** `abilities/CastBehaviours/BaseAttackBehaviour.ts`
  - Removed duplicate modifier math; `onDamage` now receives `outcome.amountDealt` from `tryDamageOrBlock`.
- [x] Replace the `string` attack-type plumbing with `TryDamageOrBlockParams['attackType']`:
  type `withDamage`'s `opts.attackType` and the private `_damageAttackType` field with the union
  and delete the `as 'melee' | 'charging'` cast.
  - **Touches:** `abilities/CastBehaviours/BaseAttackBehaviour.ts`, `abilities/CastBehaviours/MeleeAttack.ts`
  - Typed `_damageAttackType`, `setDeclarativeDamage`, and `withDamage` opts with `TryDamageOrBlockParams['attackType']`; removed cast in `runDeclarativeDamage`.
- [x] No behaviour change intended; full suite green. No new scenarios.
  - `npm run lint` clean (0 errors); full suite **515 tests passed** (64 files), 2026-06-11.

---

### Step 3 — Per-unit damage resolver; delete the deprecated `withDamage(fn)` overload

- [x] Add the resolver form `withDamage((ctx, unit) => number, opts?)` to the declarative path:
  `runDeclarativeDamage` resolves the amount per unit (flat number stays the fast path).
  `onDamage` / `onBlocked` fire for resolver-based damage exactly as for flat damage.
  - **Touches:** `abilities/CastBehaviours/BaseAttackBehaviour.ts`, `abilities/CastBehaviours/MeleeAttack.ts`
  - Added `_damageResolver` field, `setDeclarativeDamageResolver` method, updated `hasDeclarativeDamage` and `runDeclarativeDamage` to handle resolver per unit.
- [x] Migrate `0103_SwingBat` and `0115_SwingBat` (the last two legacy-callback users) to the
  resolver form, preserving their research-bonus and single-player dark-wolf damage overrides
  exactly (no tuning changes). Move any per-hit side effects into `onDamage`.
  - **Touches:** `card_defs/0103_SwingBat/0103Ability.ts`, `card_defs/0115_SwingBat/0115Ability.ts`
  - Both converted to `withDamage((ctx, unit) => number)`; removed `tryDamageOrBlock` imports from both files.
- [x] Delete the deprecated `withDamage(fn: (ctx, hitUnits) => void)` overload and the
  `damageCallback` field/branch from `MeleeAttackBehaviour`. Grep `withDamage((` to confirm
  no remaining users before deleting.
  - **Touches:** `abilities/CastBehaviours/MeleeAttack.ts`
  - Confirmed only 0103/0115 were legacy callers; deleted `damageCallback` field, old overload, and legacy branch in `onTick`.
- [x] AbilityTest: existing swing-bat scenarios pass unchanged (regression gate). No new scenarios.
  - `npm run lint` 0 errors; full suite **515 tests passed** (64 files), 2026-06-11.

---

### Step 4 — `onAttackBlocked` optional at the contract level

- [x] Make `onAttackBlocked` optional on `AbilityStatic` and switch every invocation site to
  optional-call (`ability.onAttackBlocked?.(...)`) — grep `onAttackBlocked` to find them
  (expect `blockingHelpers.ts` `executeBlock` and `game/projectiles/Projectile.ts`; verify).
  Remove the default-fill from `defineAbility` (no longer needed) and update
  `defineAbility.test.ts` accordingly. Keep `AbilityBase`'s default for class-based abilities.
  - **Touches:** `abilities/Ability.ts`, `abilities/blockingHelpers.ts`, `game/projectiles/Projectile.ts`, `abilities/defineAbility.ts`, `abilities/defineAbility.test.ts`
  - `onAttackBlocked?` was already optional on `AbilityStatic` and `blockingHelpers.ts` already used `ability?.onAttackBlocked?.()`. Removed the no-op default from `defineAbility` (deleted the fill block and `onAttackBlocked` from the return object), removed `AttackBlockedInfo` import, updated `AbilityDefInput` to no longer `Omit` it (inherits optional naturally). Updated test to assert `undefined` when not provided. Also updated `card_defs/SKILL.md` to mark it **Optional**.
- [x] Delete the empty no-op `onAttackBlocked` stubs from the files that still carry them:
  `0103_SwingBat`, `0105_LaserSword`, `0115_SwingBat`, `0702_Pounce`, `0005_AlphaWolfSummon`,
  `0528_FaultHarvest`, `0529_SeismicGuard`, `0532_AnchoredTremor`, `0533_StoneyPunch`.
  Only delete stubs whose body is empty/comment-only — keep any with real behaviour.
  - **Touches:** the nine card files above (verify the stub is empty in each before deleting)
  - All 9 stubs were empty/comment-only; deleted. No real behaviour was lost.
- [x] No behaviour change; full suite green. No new scenarios.
  - `npm run lint` 0 errors; full suite **515 tests passed** (64 files), 2026-06-11.

---

### Step 5 — `0534_DiggingClaws` cleanup + DashBehaviour dead code

- [x] Extract a `damageEnemiesTouchingCaster({ engine, caster, abilityId, damage, attackType, alreadyHitIds, respectIFrames? })`
  helper into `abilities/targetHelpers.ts` (next to `damageEnemiesInCircle`) and use it for
  `0534`'s touch-damage loop. Keep `hitTargetIds` as a **serialized array** on the ability note
  (it round-trips through checkpoints — do not switch to a `Set`); the helper takes/returns ids
  so the note shape is unchanged.
  - **Touches:** `abilities/targetHelpers.ts`, `card_defs/05_earth_core/0534_DiggingClaws/0534Ability.ts`
  - Already implemented prior to this step: `damageEnemiesTouchingCaster` was already in `targetHelpers.ts` and `0534Ability.ts` already used it. No changes needed.
- [x] Remove the unused `withMovement(enabled)` method from `DashBehaviour` — it was added "for
  future use" in the previous plan and has no callers (grep `withMovement` to confirm before
  deleting).
  - **Touches:** `abilities/CastBehaviours/DashBehaviour.ts`
  - Confirmed no callers; deleted `withMovement` method, `_movementEnabled` private field, and removed the `_movementEnabled` guard in `onTick` (movement always runs unless `payload.stopped`).
- [x] AbilityTest: the three existing `0534` scenarios (including `earthCoreDiggingClawsScenario`)
  pass unchanged. No new scenarios.
  - `npm run lint` 0 errors; full suite **515 tests passed** (64 files), 2026-06-11.

---

### Step 6 — Wire SpriteEffect into the declarative surfaces

- [x] Allow `AbilityTimingEmitterDef` (in `abilities/abilityTimings.ts` /
  `abilities/createEmitterFromDef.ts`) and the `triggerAoEExplosion` ability-event effect (in
  `abilities/events/AbilityEffect.ts` / `AbilityEventRuntime.ts`) to reference a sprite-effect id
  from `SPRITE_EFFECT_DEFS`, so declarative VFX can name a sprite def instead of an effect-type
  string + hand-built `effectData`.
  - **Touches:** `abilities/abilityTimings.ts`, `abilities/createEmitterFromDef.ts`, `abilities/events/` (effect type + runtime), `game/effect_defs/spriteEffectDefs.ts`
  - Added `spriteEffectId?` to `EmitterDefShared` and made `effectType` optional in all three `AbilityTimingEmitterDef` modes. Added `resolveEmitterEffectFields` helper in `createEmitterFromDef.ts`. Added `spriteEffectId?` to `triggerAoEExplosion` in `AbilityEffect.ts`; `AbilityEventRuntime.ts` resolves it to `'SpriteEffect'` + `effectData: { defId }`.
- [x] Remove the `rotation: 'random'` option from `SpriteEffectDef` — it is a silent no-op
  (`Math.random` is banned in `game/`). Callers must pass a concrete rotation; update the one
  existing call site (`0005_AlphaWolfSummon`) if it relies on it.
  - **Touches:** `game/effect_defs/spriteEffectDefs.ts`, `abilities/effectHelpers.ts`, `card_defs/dark_animals/0005_AlphaWolfSummon/0005Ability.ts`
  - Removed `'random'` from `SpriteEffectDef.rotation` union; updated `createVisual` comment and branch (now `else` branch for numbers, no `'random'` case). `0005_AlphaWolfSummon` already passed numeric rotation — no change needed.
- [x] Convert at least one more hand-rolled one-shot visual to a sprite-effect def via the new
  declarative wiring (implementer's choice — a simple emitterDef or AoE-explosion visual; note
  the pick in the summary).
  - **Touches:** one ability/effect call site + `spriteEffectDefs.ts`
  - Added `clawFlash` SpriteEffectDef (white star-burst SVG, scales 8→20px, fades over 0.3s, cyan tint). Wired it into `card_defs/0111_Claw/0111Ability.ts` active interval via `emitterDef: { mode: 'instant', spriteEffectId: 'clawFlash', effectDuration: 0.3 }` — first declarative use of `spriteEffectId` in an emitterDef.
- [x] No AbilityTest scenario — cosmetic only. Lint + full suite is the bar.
  - `npm run lint` 0 errors; full suite **515 tests passed** (64 files), 2026-06-11.

---

### Step 7 — Migration wave: enemy melee + archer shot

- [x] Migrate `0002_EnemyMeleeAttack` from its legacy `doCardEffect` path to `defineMeleeStrike`
  (it is a plain melee-line strike; preserve timings, damage, and AI settings exactly).
  - **Touches:** `card_defs/0002_EnemyMeleeAttack/0002Ability.ts`
  - Rewrote to use `defineMeleeStrike` with `meleeLineHitbox(50, 20)`, windup=0.5s, active=0.5s, cooldown=2.5s, impactAt=1.0 (fires at end of active window), aiMaxRange=75. Preserved `renderActivePreview` (cone telegraph) and removed the `onAttackBlocked` no-op stub (already cleaned up). Deleted all doCardEffect, abilityNote, and local GameEngineLike interface boilerplate.
- [x] Migrate `0001_EnemyArcherShot` to `CastBehaviours.ProjectileLaunch()` on an Active interval
  (the throw pattern), deleting its `doCardEffect` tick gate and any local engine interface.
  - **Touches:** `card_defs/0001_EnemyArcherShot/0001Ability.ts`
  - Rewrote using `defineAbility` + `CastBehaviours.ProjectileLaunch().withSpeed(800).withMaxRange(280).withBaseDamage(4)` on the `active` interval (LOCK_TIME to PREFIRE_TIME). Deleted `doCardEffect`, `GameEngineLike` interface, and `isAbilityNote` lock logic. `onAttackBlocked` preserved (real behavior: `deactivateProjectileOnBlock`). `renderActivePreview` preserved verbatim. `getRange` provided explicitly.
- [x] AbilityTest: these are core enemy attacks used across mission scenarios — the existing
  scenario suite is the regression gate. If **no** scenario anywhere exercises the archer shot,
  add one high-level scenario (archer + player dummy in range → player unit takes damage);
  otherwise add nothing.
  - **Touches:** `testing/scenarios/` (verify/add), `testing/scenarios/registry.ts`
  - No pre-existing archer scenario found. Added `enemyArcherShotScenario` (id `enemy_archer_shot`) to `enemies.ts`: enemy_ranged archer at (300, 180) shoots toward player dummy at (180, 180); asserts player hp < maxHp. Registered in `registry.ts`. Suite went from 515 → 516 tests (46 SimulationRunner tests, 1 new scenario included).

---

### Step 8 — `ConvexQuadHitbox` + BeastClaw / AlphaWolfClaw migration

- [x] Create `hitboxes/ConvexQuadHitbox.ts` (per Key Interfaces): a `HitboxSpec` subclass for the
  square-in-front shape, reusing the `getSquareInFront` + `pointInQuad` geometry currently
  hand-rolled in `0611_BeastClaw`. Implement all four `HitboxSpec` members so targeting preview,
  lock-on resolution, and hit resolution share one geometry (no drift). Re-export from
  `hitboxes/index.ts`.
  - **Touches:** `hitboxes/ConvexQuadHitbox.ts` (create), `hitboxes/index.ts`
  - Created `ConvexQuadHitboxSpec` with `getQuadInFront`/`pointInConvexQuad` geometry matching original abilities. Factory `convexQuadHitbox(reach, width, numTargets?)` defaults to 99 targets (all in quad). `maxRange = reach + DEFAULT_UNIT_RADIUS`. Exported `ConvexQuadHitboxSpec` and `convexQuadHitbox` from `hitboxes/index.ts`. Added `getQuadGeometry()` public method for VFX callbacks.
- [x] Migrate `0611_BeastClaw` to `CastBehaviours.MeleeAttack().withHitbox(convexQuadHitbox(...))`
  with declarative damage (preserve its slash-trail VFX via `withImpactVFX` and any riders via
  `onDamage`). Delete its manual geometry + unit iteration.
  - **Touches:** `card_defs/utility/0611_BeastClaw/0611Ability.ts`
  - Rewrote using `defineAbility` with two active intervals (slash1/slash2), each with a `MeleeAttack().withHitbox(convexQuadHitbox(10, 28))`. Slash-trail VFX preserved via `withImpactVFX` using `HITBOX.getQuadGeometry`. `doCardEffect`, `GameEngineLike`, `getSquareInFront`, `pointInQuad` all deleted.
- [x] Migrate `0004_AlphaWolfClaw` (the enemy twin) the same way — via `defineMeleeStrike` with
  `hitbox: convexQuadHitbox(...)` if its timings fit the single-strike shape, otherwise direct
  behaviour wiring.
  - **Touches:** `card_defs/dark_animals/0004_AlphaWolfClaw/0004Ability.ts`
  - Rewrote using `defineAbility` directly (needed for `renderActivePreview` preservation). `convexQuadHitbox(40, 44)`, single `MeleeAttack` behaviour on active interval, `withImpactVFX` for punch effect. `renderActivePreview` with `drawEnemyConvexQuadHitboxTelegraph` preserved via `HITBOX.getQuadGeometry`. `doCardEffect`, `GameEngineLike`, local geometry helpers deleted.
- [x] AbilityTest: ensure one high-level BeastClaw scenario exists (dummy in the front quad →
  takes damage; dummy behind the caster → does not). Add only if missing.
  - **Touches:** `testing/scenarios/` (verify/add), `testing/scenarios/registry.ts`
  - Added `beastClawFrontHitBackMissScenario` (id `beast_claw_front_hit_back_miss`) in `beastClawScenarios.ts`. Registered in `registry.ts` and added test to `SimulationRunner.test.ts`. Suite went from 515 → 516 tests (47 SimulationRunner tests). Also added `beast_claw` → `0611` mapping to `inferScenarioAbilityId`.

---

### Step 9 — Throw-pattern adoption: Stone Tomb, Knock, Throw Torch

- [ ] Migrate `0530_StoneTomb` to `CastBehaviours.ProjectileLaunch()` on its Active interval,
  keeping its AoE-on-expiry via the existing `onProjectileExpired` /
  `ON_PROJECTILE_EXPIRED` path (mirror `0108_ThrowChargedRock` from the previous plan).
  - **Touches:** `card_defs/05_earth_core/0530_StoneTomb/0530Ability.ts`
- [ ] Migrate `0531_Knock` the same way, preserving its `stonephase` projectile modifier.
  - **Touches:** `card_defs/05_earth_core/0531_Knock/0531Ability.ts`
- [ ] Migrate `0601_ThrowTorch` to `ProjectileLaunch` with its torch-landing behaviour preserved
  (the `TorchProjectile` → `LightSource` conversion is engine-side in
  `EffectManager.gameUpdate` — confirm how the launch wires into it before editing).
  - **Touches:** `card_defs/utility/0601_ThrowTorch/0601Ability.ts`
- [ ] AbilityTest: `0530`/`0531` have existing earth-core test coverage (`0530Ability`/`0531Ability`
  tests and scenarios — verify and rely on them). For `0601`, if no scenario covers it, add one
  high-level scenario (throw torch at a dark tile → a light source exists afterwards); otherwise
  add nothing.
  - **Touches:** `testing/scenarios/` (verify/add), `testing/scenarios/registry.ts`

---

## AbilityTest philosophy for this plan

Same as the previous plan (see `.claude/skills/ability-tests/SKILL.md`):

- **One scenario per ability, maximum.** Combine assertions in a single scenario.
- **No low-level number checks** — assert "took damage", not "took exactly 10".
- Migration steps lean on **existing scenarios as the regression gate**; only add a scenario
  when an ability being migrated has none.
- Cosmetic systems (SpriteEffect wiring) get **no scenarios** — lint + full suite only.

---

## What is explicitly OUT OF SCOPE for this plan

- A `dealBonusDamage` helper for `0118_SneakyPunch`-style riders — single call site today;
  extract when a second rider appears (Rule of Three).
- Migrating the remaining earth-core `doCardEffect` actives (`0524`, `0526`, `0532`, `0533`) —
  they are entangled with terrain/resonance mechanics; migrate opportunistically when touched.
- Making `getRange` optional on `AbilityStatic` (wider call-site sweep; `defineAbility` already
  covers the common case).
- `definePerpendicularSwing` factory — only if a fifth swing card appears.
- A behaviour/template for `0534`'s wall-dash + slingshot — only if a second wall-dash ability
  appears.
- Inline SVG card-art pipeline; serializing Effects into checkpoints.

---

## File Reference Map

| File | Role |
|---|---|
| `abilities/damageModifiers.test.ts` | Red test triage (Step 1) |
| `abilities/blockingHelpers.ts` | `DamageOutcome` return type (Step 2); optional `onAttackBlocked` call (Step 4) |
| `abilities/CastBehaviours/BaseAttackBehaviour.ts` | Single-source `amountDealt`, typed attackType, damage resolver (Steps 2–3) |
| `abilities/CastBehaviours/MeleeAttack.ts` | Overload changes; legacy callback deletion (Steps 2–3) |
| `abilities/Ability.ts` | `onAttackBlocked` optional (Step 4) |
| `abilities/defineAbility.ts` | Drop default-fill for `onAttackBlocked` (Step 4) |
| `abilities/targetHelpers.ts` | `damageEnemiesTouchingCaster` helper (Step 5) |
| `abilities/CastBehaviours/DashBehaviour.ts` | Remove dead `withMovement` (Step 5) |
| `abilities/abilityTimings.ts` + `abilities/events/` | Sprite-effect id support in declarative VFX (Step 6) |
| `game/effect_defs/spriteEffectDefs.ts` | Drop `rotation: 'random'`; new defs (Step 6) |
| `hitboxes/ConvexQuadHitbox.ts` | NEW — quad melee hitbox spec (Step 8) |
| `card_defs/**` | Migrations per step |
| `testing/scenarios/**` | High-level AbilityTest scenarios (verify/add per step) |
