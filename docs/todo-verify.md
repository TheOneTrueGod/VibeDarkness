# Completed Todos

## Trivial

| Todo | Notes | Date |
|------|-------|------|
| Modify your ability tests skill. One test per ability | Added "Test design principles" section to ability-tests SKILL.md: one scenario per ability max, combine multiple assertions, require comment if a second scenario is needed. | 2026-05-31 |
| Migrate ImpactConversion (0521) to castBehaviours | Deleted empty `doCardEffect` stub and unused `ResolvedTarget` import from `0521Ability.ts`. | 2026-05-31 |
| Migrate BedrockScavenger (0522) to castBehaviours | Deleted empty `doCardEffect` stub and unused `ResolvedTarget` import from `0522Ability.ts`. | 2026-05-31 |
| Migrate DeepResonance (0523) to castBehaviours | Deleted empty `doCardEffect` stub and unused `ResolvedTarget` import from `0523Ability.ts`. | 2026-05-31 |
| Migrate FaultHarvest (0528) to castBehaviours | Deleted empty `doCardEffect` stub and unused `ResolvedTarget` import from `0528Ability.ts`. | 2026-05-31 |
| Migrate SeismicGuard (0529) to castBehaviours | Deleted empty `doCardEffect` stub and unused `ResolvedTarget` import from `0529Ability.ts`. | 2026-05-31 |

## Easy

| Todo | Notes | Date |
|------|-------|------|
| Migrate LaserSword (0105) to castBehaviours | Replaced `doCardEffect`, `beginActiveCast`, `renderTargetingPreview`, and `meleeTrackingHelpers` usage with `CastBehaviours.MeleeAttack().withHitbox().withSlide().withImpactVFX().withDamage()`. Added `targetDef` on the slash timing interval; set `targets: []` and removed `meleeTracking` tag. | 2026-05-31 |
| Migrate SwingBat / 0115 to castBehaviours | Already done — `doCardEffect` removed, `targets: []`, full `CastBehaviours.MeleeAttack()` chain with `targetDef` on the hit interval; todo was stale. | 2026-06-02 |
| Migrate RaiseShield (0104) to castBehaviours | Added `setAbilityNote` to `AbilityEffect` and `AbilityEventRuntime`; replaced `doCardEffect` with an `ON_CAST_START` `abilityEvents` rule that initialises `{ blockCount: 0 }`. | 2026-06-02 |
| Migrate LaserShield (0106) to castBehaviours | Same pattern as RaiseShield — replaced `doCardEffect` with an `ON_CAST_START` `abilityEvents` rule using the new `setAbilityNote` effect. | 2026-06-02 |

## Medium

| Todo | Notes | Date |
|------|-------|------|
| Migrate Dodge (0101) to castBehaviours | Created `DashBehaviour` (pure movement CastBehaviour); added `effectDuration` + `useCasterVisualData` to `AbilityTimingEmitterDef` for afterimage trail; added `excludeSelf` to `recoverCharge` effect; replaced `doCardEffect` with `emitterDef` + `behaviour` + `ON_CAST_START` abilityEvents rule. | 2026-06-02 |
| Move enrageDef from Unit instance onto unitDef | Extracted inline UNIT_DEFS type to exported `UnitDefEntry`, added `enrageDef` to it and the `alpha_wolf` entry, replaced the Unit backing field with a getter delegating to `getUnitEnrageDef()`, removed from `toJSON`/`fromJSON` and all spawn configs. Also created `game-object-def-pattern` skill documenting the def-based vs instance-based property classification rule. | 2026-05-31 |

## Hard

| Todo | Notes | Date |
|------|-------|------|
