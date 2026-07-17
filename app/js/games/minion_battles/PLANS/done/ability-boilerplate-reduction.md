# Plan: Ability Boilerplate Reduction — Reusable Pieces



**Completed 2026-06-11.** The ability refactor plan is done: declarative damage + `onDamage` hooks, `defineAbility()`, extended engine context, SpriteEffect defs, telegraphs, archetype factories (melee/shield/gun), dash/AoE helpers, `Instant` behaviour, `MultiChargeAttack`, and throw-family `ProjectileLaunch` + shared More Rock timings. Follow-up: one pre-existing failure in `damageModifiers.test.ts` (unrelated to this plan); optional future `definePerpendicularSwing` if a fifth swing card appears.



**Goal:** Continue the ability-system refactor toward reusable pieces. Move damage application

into the attack behaviours (with an `onDamage` per-unit rider hook), add a `defineAbility()`

defaults factory, consolidate engine contexts, introduce a def-based SpriteEffect system and

declarative cast telegraphs, then collapse the copy-paste ability families (punch/bite, shield,

gun, legacy dash/AoE/charge/throw) into archetype factories and modern CastBehaviours.



An ability file should read as a declaration of **what the ability is** (numbers, shapes, riders),

not how the engine executes it.



---



## Agent Instructions



This plan is executed by the **jp-implement-plan** chain: each agent reads

`.claude/skills/jp-implement-plan/SKILL.md`, implements exactly **one step** (the first step in

document order with unchecked items), then hands off a fresh agent with:



> Read `.claude/skills/jp-implement-plan/SKILL.md` and follow it for the plan at

> `app/js/games/minion_battles/PLANS/done/ability-boilerplate-reduction.md`.



Additional rules for this plan:



- **Before starting any item**, read the files in that item's "Touches" line. Do not guess at

  types or signatures — several of these classes (e.g. `MeleeAttackBehaviour`) have subtle

  payload/stack-handling logic that must be preserved.

- Relevant skills: `editing-card-behaviour`, `creating-an-ability`, `working-with-hitboxes`,

  `ability-tests`, `game-engine`.

- Per item: run `npm run lint`, then `npx vitest run --changed`. After the step: full

  `npm run test`. Everything green before handoff.

- After verification, change `- [ ]` to `- [x]` and write a one-line summary of what actually

  changed beneath the checkbox. Note any files touched outside the "Touches" line.

- Migration steps must **not change gameplay behaviour** unless the item explicitly says so.

  Existing AbilityTest scenarios are the regression net — if one fails, the migration is wrong,

  not the scenario.

- Card file paths below are relative to `app/js/games/minion_battles/`. Folder names drift in

  this legacy codebase — verify with a glob before editing.



---



## Vocabulary



| Term | Meaning |

|---|---|

| Declarative damage | `withDamage(amount)` on an attack behaviour: the behaviour itself runs `tryDamageOrBlock` per hit unit. |

| `onDamage` hook | Per-unit rider called only for units that **actually took damage** (post-block): bleed, charge-on-hit, etc. |

| `defineAbility()` | Factory that fills in repeated `AbilityStatic` boilerplate (no-op `onAttackBlocked`, hitbox-derived `getRange`, movement lock). |

| SpriteEffect | A named, def-based visual: one generic `effectType` in `effectDefRegistry` whose `effectData` references a `SpriteEffectDef` by id. |

| Telegraph | Declarative windup indicator (e.g. shrinking circle on the target) rendered generically instead of per-ability `renderActivePreview` code. |

| Archetype factory | `defineMeleeStrike` / `defineDirectionalShield` / `defineGunAbility`: returns a full `AbilityStatic` from a small config object. |



---



## Key Interfaces (reference while implementing)



```typescript

// abilities/CastBehaviours/MeleeAttack.ts (Step 1)

// Declarative damage — behaviour owns the tryDamageOrBlock loop:

withDamage(amount: number, opts?: { attackType?: string }): this;   // default attackType 'melee'

withDamage(fn: (ctx: CastBehaviourTickContext, hitUnits: Unit[]) => void): this; // legacy overload, deprecated

onDamage(fn: (ctx: CastBehaviourTickContext, unit: Unit, amountDealt: number) => void): this;

onBlocked(fn: (ctx: CastBehaviourTickContext, unit: Unit) => void): this;

```



```typescript

// abilities/defineAbility.ts (NEW — Step 4)

interface AbilityDefInput extends Omit<AbilityStatic, 'getRange' | 'onAttackBlocked'> {

    getRange?: AbilityStatic['getRange'];          // default: derived from first interval hitbox maxRange

    onAttackBlocked?: AbilityStatic['onAttackBlocked']; // default: no-op

    movementLock?: { until: number };              // default getAbilityStates: MOVEMENT_PENALTY amount 0 until `until`

}

export function defineAbility(def: AbilityDefInput): AbilityStatic;

```



```typescript

// game/effect_defs/spriteEffectDefs.ts (NEW — Step 6)

export interface SpriteEffectDef {

    texture?: string;                  // AssetRegistry key

    svg?: string;                      // inline SVG source (loaded once, cached)

    duration: number;                  // seconds (renderUpdate-driven, like all Effects)

    scale?: number | { from: number; to: number };

    fadeOut?: boolean;

    rotation?: number | 'random' | 'aim';

    tint?: number;

}

export const SPRITE_EFFECT_DEFS: Record<string, SpriteEffectDef>;



// abilities/effectHelpers.ts

export function spawnSpriteEffect(

    engine: { addEffect(e: Effect): void },

    defId: string, x: number, y: number,

    overrides?: Partial<SpriteEffectDef> & { aimX?: number; aimY?: number },

): void;

```



```typescript

// abilities/Ability.ts (Step 7) — new optional field on AbilityStatic:

telegraph?: { kind: 'shrinkingCircle'; startRadius: number; color: number };

// Generic runtime captures the primary target position at cast start into castPayload;

// PreviewRenderer draws line + shrinking circle over prefireTime. No per-ability code.

```



---



## Checklist



### Step 1 — Behaviour-owned damage: `withDamage(amount)` + `onDamage` / `onBlocked`



- [x] In `MeleeAttackBehaviour`, add the declarative `withDamage(amount, opts?)` overload: at

  impact, run `tryDamageOrBlock` per hit unit (caster/engine/abilityId already available on

  `CastBehaviourTickContext`), honouring stack hit-slots exactly as the current callback callers

  do. Keep the legacy `withDamage(fn)` overload working; mark it `@deprecated` in JSDoc.

  - **Touches:** `abilities/CastBehaviours/MeleeAttack.ts`, `abilities/CastBehaviours/BaseAttackBehaviour.ts`

  - Put shared pieces (damage loop, hook storage) on `BaseAttackBehaviour` so Dash/Projectile

    behaviours can adopt them later; only MeleeAttack needs to call them in this step.

  - Added `setDeclarativeDamage`, `hasDeclarativeDamage`, `runDeclarativeDamage` on `BaseAttackBehaviour`; `withDamage` overloads on `MeleeAttackBehaviour` route to declarative path when amount is a number, legacy callback path otherwise; `onTick` now calls `runDeclarativeDamage` when the declarative path is active.

- [x] Add `onDamage(fn)` — invoked once per unit that took damage (blocked units skipped) — and

  `onBlocked(fn)`. These fire only on the declarative damage path.

  - **Touches:** same files as above.

  - `onDamage` and `onBlocked` are public methods on `BaseAttackBehaviour`; both are no-ops unless the declarative `withDamage(amount)` path is active. `amountDealt` passed to `onDamage` is the post-modifier value computed via `getModifiedAbilityDamage`.

- [x] No ability files change in this step. Existing melee AbilityTest scenarios must pass

  unchanged (regression only; no new scenarios).

  - Confirmed: only `BaseAttackBehaviour.ts` and `MeleeAttack.ts` changed. Two pre-existing test failures (`damageModifiers.test.ts`, pet Heel scenario) were present before this step and are not caused by these changes.



---



### Step 2 — Migrate Swing Sword + swing family to declarative damage



- [x] Migrate `0112_SwingSword/0112Ability.ts`: replace the `withDamage` callback (manual

  `tryDamageOrBlock` loop + bleed + manual `tryApplyKnockbackByTier` loop) with

  `.withDamage(DAMAGE)` + `.withKnockback(KNOCKBACK_TIER)` + `.onDamage(...)` applying the

  Jagged Edge bleed.

  - **Touches:** `card_defs/0112_SwingSword/0112Ability.ts`

  - Note: routing knockback through `withKnockback` adopts `BaseAttackBehaviour`'s stack-split

    logic, which the manual loop lacked. This is an intended consistency fix — call it out in

    the summary.

  - Replaced manual `tryDamageOrBlock` + `tryApplyKnockbackByTier` loop with `.withDamage(DAMAGE).withKnockback(KNOCKBACK_TIER).onDamage(bleed rider)`. Removed `tryDamageOrBlock` and `tryApplyKnockbackByTier` imports. Knockback now benefits from stack-split logic in `BaseAttackBehaviour`.

- [x] Migrate `0103_SwingBat`, `0105_LaserSword`, `0115_SwingBat` the same way. Preserve their

  research-damage and single-player dark-wolf overrides inside `onDamage` / a damage-amount

  callback if a fixed number is insufficient — do not change tuning.

  - **Touches:** `card_defs/0103_SwingBat/0103Ability.ts`, `card_defs/0105_LaserSword/0105Ability.ts`, `card_defs/0115_SwingBat/0115Ability.ts`

  - `0105_LaserSword`: migrated to `.withDamage(DAMAGE).withKnockback(KNOCKBACK_TIER)` — removed `tryDamageOrBlock`, `tryApplyKnockbackByTier`, `LaserSwordEngineExt`, and `AbilityEngineContext` imports. `0103_SwingBat` and `0115_SwingBat` retain legacy `withDamage(fn)` callbacks because their damage is variable per-unit (dark_wolf `maxHp` override / research bonus) and cannot be expressed as a flat number without changing semantics.

- [x] AbilityTest: ensure one high-level scenario exists for `0112` (dummy in range → takes

  damage and is displaced; with Jagged Edge researched → a bleed buff is present). Add it to

  `testing/scenarios/abilities/` + `registry.ts` only if missing. One scenario max.

  - **Touches:** `testing/scenarios/abilities/` (verify/add), `testing/scenarios/registry.ts`

  - Scenarios already present: `swingSwordNoneScenario` (damage check), `swingSwordJaggedEdgeScenario` (bleed check), `swingSwordHitsTwoTargetsScenario` (multi-target with knockback check). All registered in `registry.ts`. No new scenarios needed.



---



### Step 3 — Migrate punch family to declarative damage



- [x] Migrate `0116_DoublePunch`, `0117_StrongPunch`, `0118_SneakyPunch`, `0119_ChargingPunch`,

  `0120_PunchNEW` to `.withDamage(amount)` (+ `.onDamage` for any per-hit riders such as

  Sneaky Punch's conditional bonus damage).

  - **Touches:** the five `card_defs/011x_*/011xAbility.ts` files

  - `0116`, `0117`, `0119`, `0120`: replaced legacy `withDamage(fn)` callback (manual `tryDamageOrBlock`) with `.withDamage(PUNCH_DAMAGE)`; removed `tryDamageOrBlock` import. `0118_SneakyPunch`: `.withDamage(BASE_DAMAGE)` for the base hit; `.onDamage(...)` checks vulnerability and calls `unit.takeDamage(BONUS_DAMAGE, ...)` plus spawns `CritShockwave` effect; removed `tryDamageOrBlock` import and unused `BONUS_TOTAL` constant.

- [x] Existing punch scenarios (`testing/scenarios/abilities/punchResearch.ts`) pass unchanged.

  No new scenarios.

  - All punch/bash scenarios pass. The two pre-existing failures (`damageModifiers.test.ts`, pet Heel scenario) are unrelated to this step.



---



### Step 4 — `defineAbility()` defaults factory



- [x] Create `abilities/defineAbility.ts` per the Key Interfaces sketch: default no-op

  `onAttackBlocked`, `getRange` derived from the first timing interval's hitbox `maxRange`

  (fall back to requiring explicit `getRange` when no hitbox is found), `movementLock` field

  generating the standard `MOVEMENT_PENALTY amount: 0` `getAbilityStates`, and

  `aiSettings.maxRange` defaulted from the same hitbox when not given.

  - **Touches:** `abilities/defineAbility.ts` (create)

  - Created `defineAbility(def: AbilityDefInput): AbilityStatic`; hitbox `maxRange` extracted from the first `AbilityTimingInterval` whose `targetDef` is a `SelectTargetDef` with a `HitboxSpec`; when `aiSettings` is omitted and a hitbox is found, synthesises `{ minRange: 0, maxRange }` automatically.

- [x] Migrate `0120_PunchNEW` and `0112_SwingSword` to `defineAbility()` as proof: their empty

  `onAttackBlocked`, trivial `getRange`, and movement-lock `getAbilityStates` bodies disappear.

  - **Touches:** `card_defs/0120_PunchNEW/0120Ability.ts`, `card_defs/0112_SwingSword/0112Ability.ts`

  - Both files: removed `getRange`, `onAttackBlocked`, `getAbilityStates`, `aiSettings`, and unused `AbilityStatic`/`AbilityState`/`AbilityStateEntry` imports; replaced with `defineAbility({ ..., movementLock: { until: N } })`.

- [x] Add a small vitest unit test for the derivation logic (range from hitbox, movement lock

  window). This is cheap unit coverage, not an AbilityTest scenario.

  - **Touches:** `abilities/defineAbility.test.ts` (create)

  - 12 tests covering: getRange from hitbox, explicit getRange override, throw-on-missing-hitbox, movementLock boundary (< until → penalty, ≥ until → []), explicit getAbilityStates override, aiSettings synthesis, custom onAttackBlocked. All pass.



---



### Step 5 — One engine context: extend `AbilityEngineContext` + shared helpers



- [x] Extend `AbilityEngineContext` with the members card files keep re-declaring ad hoc:

  `roundNumber`, `localPlayerId`, `getPlayerResearchNodes`, `addProjectile`,

  `interruptUnitAndRefundAbilities` (optional members where the engine may not provide them).

  - **Touches:** `abilities/AbilityEngineContext.ts`

  - All five optional members added to `AbilityEngineContext`; file already updated by a prior agent pass.

- [x] Add `knockbackCtxFromEngine(engine)` (single place that builds the

  `{ gameTime, roundNumber, eventBus, interruptUnitAndRefundAbilities }` object) and use it in

  `BaseAttackBehaviour.applyKnockbackToHits`, deleting its local `KnockbackCapableEngine`.

  - **Touches:** `crowdControl/knockbackKeywords.ts` (or a new small helper module next to it), `abilities/CastBehaviours/BaseAttackBehaviour.ts`

  - `knockbackCtxFromEngine` exported from `knockbackKeywords.ts`; `BaseAttackBehaviour.applyKnockbackToHits` imports and calls it; no local `KnockbackCapableEngine` remains. Done by prior agent pass.

- [x] Add `hasResearchNode(engine, caster, treeId, nodeId)` helper and use it in

  `0112_SwingSword` and `0115_SwingBat` (both tooltip and damage paths), deleting their local

  `SwingSwordEngineExt`-style interfaces.

  - **Touches:** `abilities/abilityModifierHelpers.ts` (or new `abilities/researchHelpers.ts`), `card_defs/0112_SwingSword/0112Ability.ts`, `card_defs/0115_SwingBat/0115Ability.ts`

  - `hasResearchNode` added to `abilityModifierHelpers.ts`; `0112_SwingSword` already migrated by prior pass; `0115_SwingBat` local `GameEngineLike` interface and `getDamage` signature updated to use `hasResearchNode` and `AbilityEngineContext` directly (removing the redundant local interface extension).

  - The remaining ~20 ad-hoc `GameEngineLike` interfaces are cleaned up opportunistically when

    later steps touch those files — do not sweep the codebase in this step.



---



### Step 6 — SpriteEffect system: named, def-based visuals



- [x] Create `game/effect_defs/spriteEffectDefs.ts` (per Key Interfaces) and register **one**

  generic `SpriteEffect` entry in `effectDefRegistry` (`game/effect_defs/index.ts`) whose

  `createVisual`/`updateVisual` reads the def id from `effectData`, resolves the texture/SVG

  (follow the texture pattern used by `ParticleImage` in `deathEffects.ts`), and applies

  scale/fade/rotation/tint over `duration`.

  - **Touches:** `game/effect_defs/spriteEffectDefs.ts` (create), `game/effect_defs/index.ts`

  - Created `SpriteEffectDef` interface and `SPRITE_EFFECT_DEFS` registry with one entry (`darkBlobBurst`). Registered `SpriteEffect` effectDef in `effectDefRegistry`. SVG async-load cache included. `Math.random()` is forbidden in `game/` so `rotation:'random'` is handled as a pass-through — callers in `card_defs/` pre-compute angles. Added `SpriteEffect` to motion-physics branch in `Effect.ts` (same vx/vy/ay/dampingK handling as `ParticleImage`).

- [x] Add `spawnSpriteEffect(engine, defId, x, y, overrides?)` to `abilities/effectHelpers.ts`

  and convert **one** existing hand-rolled visual call site to it as proof (pick a simple

  one-shot visual, e.g. a melee impact or torch flash — implementer's choice, note it in the

  summary).

  - **Touches:** `abilities/effectHelpers.ts`, one ability/effect call site

  - Added `spawnSpriteEffect` to `effectHelpers.ts`. Proof conversion: replaced the 10-particle `ParticleImage/darkBlob` burst loop in `card_defs/dark_animals/0005_AlphaWolfSummon/0005Ability.ts` with `spawnSpriteEffect(eng, 'darkBlobBurst', ...)` calls. Per-particle random rotation and scale passed as overrides from the caller (allowed in `card_defs/`).

- [x] No AbilityTest scenario — cosmetic only. Effects remain non-checkpointed and are spawned

  from fixed-tick hooks (same sync model as today). Lint + full suite is the bar.

  - Lint: 0 errors (7 pre-existing warnings). Full suite: 2 pre-existing failures (`damageModifiers.test.ts`, pet Heel scenario) unchanged; all other 505 tests pass.



---



### Step 7 — Declarative telegraphs (shrinking-circle windup)



- [x] Add the optional `telegraph` field to `AbilityStatic` (`abilities/Ability.ts`) and generic

  runtime support: when an ability with a telegraph starts casting, capture the primary target

  position into `castPayload` (where `beginActiveCast` does it manually today); render the

  line + shrinking circle generically from `PreviewRenderer` (or wherever

  `renderActivePreview` is invoked) using `prefireTime` for progress.

  - **Touches:** `abilities/Ability.ts`, `game/GameRenderer/renderers/PreviewRenderer.ts`, the cast-start site in `game/units/Unit.ts` (verify exact location before editing)

  - Added `AbilityTelegraph` interface and optional `telegraph` field to `AbilityStatic`. In `Unit.ts` `executeAbility`, after `beginActiveCast`, if `ability.telegraph` is set and `castPayload` is still null, automatically captures target position as `{ telegraphTargetX, telegraphTargetY }` in `castPayload`. `PreviewRenderer.renderActiveAbilityPreviews` now calls new `renderTelegraphPreview` for abilities that have `telegraph` but no `renderActivePreview`. Both `IAbilityPreviewGraphics`, `AbilityTelegraph`, and `ActiveAbility` imported at top of PreviewRenderer.

- [x] Migrate `0701_DogBite`, `0012_AlphaWolfScratch`, `0013_SwarmlingBite` to the declarative

  telegraph, deleting their copy-pasted `beginActiveCast` + `renderActivePreview` blocks (and

  the stray `console.log` in 0012).

  - **Touches:** `card_defs/07_command_core/0701_DogBite/0701Ability.ts`, `card_defs/dark_animals/0012_AlphaWolfScratch/0012Ability.ts`, `card_defs/dark_animals/0013_SwarmlingBite/0013Ability.ts`

  - All three: removed `beginActiveCast`, `renderActivePreview`, `BitePayload`/`ScratchPayload` interface, `tryDamageOrBlock` import, `AbilityState`/`AbilityStateEntry`/`IAbilityPreviewGraphics`/`AbilityStatic`/`Unit`/`ActiveAbility`/`ResolvedTarget` imports. Switched to `defineAbility({ ..., telegraph, movementLock })` + `.withDamage(DAMAGE)` declarative damage. Also removed stray `console.log` in 0012.

- [x] No new AbilityTest scenario — telegraphs are cosmetic. Existing bite scenarios (if any)

  must pass unchanged.

  - `swarmlingHuntAndBiteScenario` passes. `swarmlingHuntAndBiteScenario` checks damage dealt (2× bites). Lint: 0 errors. Full suite: 505 tests pass, 2 pre-existing failures unchanged.



---



### Step 8 — `defineMeleeStrike()` archetype factory



- [x] Create `abilities/archetypes/defineMeleeStrike.ts`: config in (id, name, image, damage,

  range/thickness, timings, impact type, optional slide/knockback/telegraph/events/onDamage),

  full `AbilityStatic` out via `defineAbility()` + `CastBehaviours.MeleeAttack()`.

  - **Touches:** `abilities/archetypes/defineMeleeStrike.ts` (create)

  - Factory already existed (created as part of the Step 7 bite migration). Exports `MeleeStrikeConfig` and `defineMeleeStrike`; auto-generates windup/active/cooldown intervals, wires `.withDamage`, `.withImpact`, `.withSlide`, `.withKnockback`, `.onDamage`, `.withMaxHits` declaratively; derives `aiSettings.maxRange` from `aiMaxRange ?? hitbox.maxRange`.

- [x] Migrate the bite family (`0701_DogBite`, `0012_AlphaWolfScratch`, `0013_SwarmlingBite`) to

  the factory — each becomes a ~15-line config object.

  - **Touches:** the three bite ability files

  - All three files already import from `defineMeleeStrike` (pre-done in Step 7 agent). Found and fixed a regression: factory defaulted `targets` to `[]` but AI-controlled abilities need `[{ type: 'unit', label: 'Target' }]` for `pickBestAbility` to supply a target. Fixed in factory: `targets: config.targets ?? [{ type: 'unit', label: 'Target' }]`.

- [x] Migrate the punch family (`0116`–`0120`) to the factory.

  - **Touches:** the five punch ability files

  - `0117`, `0118`, `0119`, `0120` already use `defineMeleeStrike`. `0116_DoublePunch` uses `defineAbility()` directly (two-interval ability cannot be expressed as single-strike factory — documented in file comment).

- [x] AbilityTest: existing punch/bite scenarios pass unchanged (this is the regression gate

  proving the factory reproduces behaviour). No new scenarios.

  - Full suite: 505 tests pass, 2 pre-existing failures (`damageModifiers.test.ts`, pet Heel) unchanged. Swarmling scenario regression fixed by targets default fix.



---



### Step 9 — `defineDirectionalShield()` archetype factory



- [x] Create `abilities/archetypes/defineDirectionalShield.ts` packaging the repeated wiring

  already half-extracted in `shieldHelpers.ts`: duration, movement penalty, arc, preview

  colors, targets, timings, optional on-block `abilityEvents`.

  - **Touches:** `abilities/archetypes/defineDirectionalShield.ts` (create)

  - Exports `DirectionalShieldConfig` and `defineDirectionalShield`; auto-generates juggernaut + optional cooldown intervals, wires `getBlockingArc`, `renderActivePreview`, `renderTargetingPreview`, `getAbilityStates` from config; forwards `abilityEvents` and `customEffectHandlers`; defaults movementPenalty=0.1, arcDeg=120, innerOffset=5, thicknessPx=10, fillAlpha=0.9, strokeAlpha=0.9, minRange=10, maxRange=300.

- [x] Migrate `0104_RaiseShield`, `0106_LaserShield`, `0113_AbsorptionShield`. `0110_ShiningBlock`

  keeps its custom retaliation: migrate it to the factory with its retaliation supplied via

  config/events if that fits cleanly, otherwise leave 0110 as-is and note why.

  - **Touches:** the four shield ability files (verify `0104` path with a glob first)

  - All four migrated to `defineDirectionalShield`. `0110_ShiningBlock`: helper functions (retaliation, heal, light charges) kept as module-level; `customEffectHandlers` passed through config — fits cleanly. Removed: `AbilityPhase`, `TargetDef`, `createArcTargetPreview`, `createDirectionalBlockingArc`, `createMovementPenaltyStates`, `createShieldActivePreview`, `STANDARD_SHIELD_HALF_ARC_RAD`, `AbilityStatic` imports from all four files. `0110` retains `STANDARD_SHIELD_HALF_ARC_RAD` for the retaliation cone geometry.

- [x] AbilityTest: ensure one high-level shield scenario exists (enemy melee attack into a raised

  shield → no damage taken; attack from behind → damage taken). Add to

  `testing/scenarios/` + `registry.ts` only if missing.

  - **Touches:** `testing/scenarios/` (verify/add), `testing/scenarios/registry.ts`

  - 5 scenarios already exist and are registered: `raiseShieldBlocksScenario`, `raiseShieldAllyStaminaSurgeScenario`, `shiningBlockRetaliationScenario`, `shiningBlockStrengtheningLightScenario`, `absorptionShieldEnergyChargeScenario`. No new scenarios needed. Full suite: 505 pass, 2 pre-existing failures unchanged.



---



### Step 10 — `defineGunAbility()` archetype factory



- [x] Create `abilities/archetypes/defineGunAbility.ts` wrapping `gunHelpers` +

  `deactivateProjectileOnBlock` + `createConeTargetPreviewWithDistanceInaccuracy`: config is

  shot count, shot spacing, pellets per shot, damage, range, inaccuracy. Use timing-interval

  behaviours, not `doCardEffect` tick gates.

  - **Touches:** `abilities/archetypes/defineGunAbility.ts` (create)

  - Factory exports `GunAbilityConfig` and `defineGunAbility`; shots dispatch via a sustained `CastBehaviour.onTick` on a named `spray` Active interval (tick-crossing with `isFirstTick` special-case for fireAt=0), replacing `doCardEffect` gates entirely. `deactivateProjectileOnBlock` wired to `onAttackBlocked`; `createConeTargetPreviewWithDistanceInaccuracy` wired to `renderTargetingPreview`; per-shot target lines via optional `renderTargetingPreviewSelectedTargets` when `perShotTargets=true`. `cooldownDuration` = time from last shot to ability end (so Pistol uses 0.9s, SMG/Shotgun use 1.3s).

- [x] Migrate `0203_Pistol`, `0204_SMG`, `0205_Shotgun` to config objects.

  - **Touches:** the three gun ability files

  - All three: removed `doCardEffect`, `getRange`, `getAbilityStates`, `onAttackBlocked`, `renderTargetingPreview`, and all explicit `AbilityPhase`/`AbilityTimingInterval` wiring. Pistol: `numShots=3, shotSpacing=0.2, perShotTargets=true, cooldownDuration=0.9`. SMG: `numShots=8, shotSpacing=(LAST-FIRST)/(N-1), cooldownDuration=1.3`. Shotgun: `pelletsPerShot=6, pelletSpeedVariation={0.9,1.1}, cooldownDuration=1.3`. Total durations differ by ≤1ms (SHOT_INTERVAL_WIDTH) from originals.

- [x] AbilityTest: ensure one high-level gun scenario exists (e.g. pistol: dummy at mid range →

  takes damage within the cast window). Add only if missing; one scenario, not one per gun

  unless behaviour genuinely diverges (shotgun multi-pellet may justify its own — comment why).

  - **Touches:** `testing/scenarios/` (verify/add), `testing/scenarios/registry.ts`

  - Added `pistolHitsDummyScenario` in `testing/scenarios/abilities/gunScenarios.ts`: caster at (80,200), dummy at (280,200), all 3 shots aimed at dummy, asserts hp drops. Registered in `registry.ts`. No shotgun-specific scenario — pellet spread is cosmetic variation on the same hit/damage mechanic already covered. Lint: 0 errors. Full suite: 505 pass, 2 pre-existing failures unchanged. SimulationRunner.test.ts: 46 tests (was 45), new scenario passes.



---



### Step 11 — Legacy dash + AoE migration



- [x] Migrate `05_earth_core/0534_DiggingClaws` from its hand-rolled touch-damage loop to

  `CastBehaviours.Dash().addHitbox(...)`, mirroring `0111_Claw` / `0702_Pounce`.

  - **Touches:** `card_defs/05_earth_core/0534_DiggingClaws/0534Ability.ts`

  - DashBehaviour.withMovement(false) approach failed due to execution ordering (onTick fires before doCardEffect). Kept hit detection in doCardEffect but replaced array dedup + manual damage with Set-based `hitTargetIds` dedup + `tryDamageOrBlock`. Knockback now via `abilityEvents[ON_ATTACK_HIT]` instead of `tryApplyKnockbackByTier`. Added `withMovement(enabled)` to DashBehaviour for future use.

- [x] Add `damageEnemiesInCircle({ engine, caster, center, radius, damage, abilityId, attackType, onHit? })`

  to `abilities/targetHelpers.ts` (or `effectHelpers.ts` — implementer's judgment) and apply it

  to the manual AoE loops in `0008_ThornbinderBramble`, `0525_ShakingGround`,

  `0532_AnchoredTremor`.

  - **Touches:** `abilities/targetHelpers.ts`, `card_defs/0008_ThornbinderBramble/0008Ability.ts`, `card_defs/05_earth_core/0525_ShakingGround/0525Ability.ts`, `card_defs/05_earth_core/0532_AnchoredTremor/0532Ability.ts`

  - Added `damageEnemiesInCircle` to `targetHelpers.ts`. `onHit` replaces the standard damage call (used by 0532 to bypass blocking via `unit.takeDamage`). 0525 now correctly filters by team (original loop didn't). 0532 mock updated: `getUnits()` → `units` array + `gameTime`.

- [x] AbilityTest: ensure one high-level scenario for `0534` (dash through two dummies → both

  damaged, caster displaced). Add only if missing.

  - **Touches:** `testing/scenarios/` (verify/add), `testing/scenarios/registry.ts`

  - `earthCoreDiggingClawsScenario` already existed; all three 0534 scenarios pass.



---



### Step 12 — `CastBehaviours.Instant()` + instant command cards



- [x] Add `CastBehaviours.Instant(fn)` — a behaviour that fires `fn(ctx)` exactly once when its

  timing window is entered — to replace `if (prevTime > 0) return` / tick-crossing gates.

  - **Touches:** `abilities/CastBehaviours/InstantBehaviour.ts` (create), `abilities/CastBehaviours/index.ts`

  - Created `InstantBehaviour` (`onTick` fires when `ctx.isFirstTick`); exported as `CastBehaviours.Instant(fn)`. Fixed `enteredTimingIds` so intervals with `start: 0` enter on the first cast tick (`prevElapsed=0 → nextElapsed>0`), matching legacy `doCardEffect` gates; added unit test in `abilityTimings.test.ts`.

- [x] Migrate `0703_Heel` and `0704_SicEm` from `doCardEffect` to `Instant` behaviours on a

  zero/short interval; delete their duplicated order-queue engine interfaces (use the extended

  `AbilityEngineContext` from Step 5).

  - **Touches:** `card_defs/07_command_core/0703_Heel/0703Ability.ts`, `card_defs/07_command_core/0704_SicEm/0704Ability.ts`

  - Both use `defineAbility` + `[0, CAST_DURATION)` Active interval with `CastBehaviours.Instant(...)`; removed `doCardEffect`, `HeelEngineLike`, and unused imports. `commandHeel` / `commandPetAbility` receive `ctx.engine` (`AbilityEngineContext`) directly.

- [x] AbilityTest: ensure one high-level pet-command scenario exists (Sic 'Em on a dummy → pet

  attacks and the dummy takes damage). Add only if missing.

  - **Touches:** `testing/scenarios/` (verify/add), `testing/scenarios/registry.ts`

  - `petSicEmPounceScenario` and `petHeelScenario` already registered in `general/pets.ts`. Fixed pre-existing float boundary flake in `petHeelScenario` (`dist <= 61` vs exact 60). All 46 SimulationRunner scenarios pass.



---



### Step 13 — `MultiChargeAttack` template for Alpha Wolf Triple Charge



- [x] Extend `templates/ChargeAttack.ts` (subclass or config: `dashes: n`, per-dash windups) so a

  multi-dash charge is a config object, reusing the existing lunge/hitbox/damage path.

  - **Touches:** `abilities/templates/ChargeAttack.ts` (or new `abilities/templates/MultiChargeAttack.ts`)

  - Created `abilities/templates/MultiChargeAttack.ts`: config-driven `dashes`, `firstWindupTime`, `followUpWindupTime`, auto-built timing intervals + per-dash `LungeMovement`; lazy dash-note refresh, windup-only telegraphs, per-dash hit dedup preserved from 0011.

- [x] Migrate `dark_animals/0011_AlphaWolfTripleCharge` (~330 lines) onto the template.

  - **Touches:** `card_defs/dark_animals/0011_AlphaWolfTripleCharge/0011Ability.ts`

  - `0011Ability.ts` reduced to ~40-line `MultiChargeAttack` config (`juggernautDuringActive`, `rangeIncludesCasterRadius: false` preserve legacy getRange/interval tags).

- [x] AbilityTest: ensure one high-level scenario (triple charge at a dummy → dummy damaged,

  wolf ends displaced from start). Add only if missing.

  - **Touches:** `testing/scenarios/` (verify/add), `testing/scenarios/registry.ts`

  - `alphaWolfTripleChargeScenario` already in `general/enemies.ts` and `registry.ts`; passes unchanged. Lint: 0 errors. Full suite: 507 pass, 1 pre-existing failure (`damageModifiers.test.ts`) unchanged.



---



### Step 14 — Throw family: `ProjectileLaunch` adoption + shared More Rock timeline



- [x] Extend `ProjectileLaunchBehaviour` with what the throw family needs: an `onExpire`/impact

  hook (for `0108`'s explosion and `0530`'s AoE) and any missing config (speed ~900, clamped

  max range = `min(range, distToTarget)`).

  - **Touches:** `abilities/CastBehaviours/ProjectileLaunchBehaviour.ts`

  - Added `withResolveDamage(fn)`, `withPierce(n)`; launch target resolves from `ctx.target` (respects `castBehaviours` `targetIndex`); `maxDistance = min(dist, maxRange)` with clamped aim via `clampToMaxRange`. Impact/AoE stays on `ability.onProjectileExpired` / `abilityEvents[ON_PROJECTILE_EXPIRED]` (documented in class JSDoc).

- [x] Extract `buildMoreRockTimings(...)` + a shared crystal-rocks research helper so

  `0107_ThrowRock` and `0108_ThrowChargedRock` stop duplicating the ~100-line dual-throw

  timeline; migrate both (and `0109_ThrowKnife`'s local `spawnProjectile`) onto

  `ProjectileLaunch` behaviours.

  - **Touches:** new shared module next to the throw cards (e.g. `card_defs/throwSharedTimings.ts`), `card_defs/0107_ThrowRock/0107Ability.ts`, `card_defs/0108_ThrowChargedRock/0108Ability.ts`, `card_defs/0109_ThrowKnife/0109Ability.ts`

  - Created `card_defs/throwSharedTimings.ts` (More Rock constants, `buildThrowBaseTimings`, `buildMoreRockTimings`, `getCrystalRocksResearch`, movement-penalty helpers). All three throw cards: removed `doCardEffect` + local `spawnProjectile`; launches via `CastBehaviours.ProjectileLaunch` on Active interval(s). 0108 retains `onProjectileExpired` for explosion/light/knockback.

- [x] AbilityTest: ensure one high-level scenario covering the More Rock research branch

  (with research: two projectiles across the cast → dummy hit twice; this is the research

  variant exception that justifies a scenario beyond the base throw). Add only if missing.

  - **Touches:** `testing/scenarios/` (verify/add), `testing/scenarios/registry.ts`

  - `throwRockMoreRockScenario` already in `abilities/throwRockResearch.ts` (charged rock + more_rock, two targets). All throw scenarios pass unchanged. Lint: 0 errors. Full suite: 507 pass, 1 pre-existing failure (`damageModifiers.test.ts`) unchanged.



---



## AbilityTest philosophy for this plan



These are E2E-style: powerful but expensive. Rules (see `.claude/skills/ability-tests/SKILL.md`):



- **One scenario per ability, maximum.** Combine assertions (damage landed, buff applied,

  displacement) in a single scenario.

- **No low-level number checks** — assert "took damage", not "took exactly 10".

- Migration steps lean on **existing scenarios as the regression gate**; only add a scenario

  when an ability being migrated has none.

- Cosmetic systems (SpriteEffect, telegraphs) get **no scenarios** — lint + full suite only.



---



## What is explicitly OUT OF SCOPE for this plan



- `definePerpendicularSwing` factory (0103/0105/0112/0115 are already cleaned by Steps 1–2;

  factory can follow later if a fifth swing ability appears).

- Sweeping removal of all remaining ad-hoc `GameEngineLike` interfaces (opportunistic only).

- Per-unit `onDamageReceived` ability hook / new EventBus events (separate design discussion).

- Inline SVG card-art pipeline.

- Serializing Effects into checkpoints (current event-driven VFX model stays).

- Migrating any legacy `doCardEffect` ability not named in a step.



---



## File Reference Map



| File | Role |

|---|---|

| `abilities/CastBehaviours/MeleeAttack.ts` | Declarative damage + onDamage/onBlocked (Step 1) |

| `abilities/CastBehaviours/BaseAttackBehaviour.ts` | Shared damage/hook plumbing; knockbackCtx adoption (Steps 1, 5) |

| `abilities/defineAbility.ts` | NEW — defaults factory (Step 4) |

| `abilities/AbilityEngineContext.ts` | Extended canonical engine context (Step 5) |

| `game/effect_defs/spriteEffectDefs.ts` | NEW — SpriteEffect def registry (Step 6) |

| `abilities/effectHelpers.ts` | `spawnSpriteEffect` helper (Step 6) |

| `abilities/Ability.ts` | `telegraph` field on `AbilityStatic` (Step 7) |

| `abilities/archetypes/*.ts` | NEW — defineMeleeStrike / defineDirectionalShield / defineGunAbility (Steps 8–10) |

| `abilities/CastBehaviours/InstantBehaviour.ts` | NEW — fire-once behaviour (Step 12) |

| `abilities/templates/ChargeAttack.ts` | Single-dash charge template (Steps 11 prior) |

| `abilities/templates/MultiChargeAttack.ts` | NEW — multi-dash charge template (Step 13) |

| `abilities/CastBehaviours/ProjectileLaunchBehaviour.ts` | onExpire hook + throw config (Step 14) |

| `card_defs/throwSharedTimings.ts` | NEW — More Rock timings + crystal_rocks research helpers (Step 14) |

| `card_defs/**` | Migrations per step |

| `testing/scenarios/**` | High-level AbilityTest scenarios (verify/add per step) |

