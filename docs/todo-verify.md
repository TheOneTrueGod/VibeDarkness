# Completed Todos

## Trivial

| Todo | Notes | Date |
|------|-------|------|
| Migrate ImpactConversion (0521) to castBehaviours | Deleted empty `doCardEffect` stub and unused `ResolvedTarget` import from `0521Ability.ts`. | 2026-05-31 |
| Migrate BedrockScavenger (0522) to castBehaviours | Deleted empty `doCardEffect` stub and unused `ResolvedTarget` import from `0522Ability.ts`. | 2026-05-31 |
| Migrate DeepResonance (0523) to castBehaviours | Deleted empty `doCardEffect` stub and unused `ResolvedTarget` import from `0523Ability.ts`. | 2026-05-31 |
| Migrate FaultHarvest (0528) to castBehaviours | Deleted empty `doCardEffect` stub and unused `ResolvedTarget` import from `0528Ability.ts`. | 2026-05-31 |
| Migrate SeismicGuard (0529) to castBehaviours | Deleted empty `doCardEffect` stub and unused `ResolvedTarget` import from `0529Ability.ts`. | 2026-05-31 |

## Easy

| Todo | Notes | Date |
|------|-------|------|
| Migrate LaserSword (0105) to castBehaviours | Replaced `doCardEffect`, `beginActiveCast`, `renderTargetingPreview`, and `meleeTrackingHelpers` usage with `CastBehaviours.MeleeAttack().withHitbox().withSlide().withImpactVFX().withDamage()`. Added `targetDef` on the slash timing interval; set `targets: []` and removed `meleeTracking` tag. | 2026-05-31 |

## Medium

| Todo | Notes | Date |
|------|-------|------|
| Move enrageDef from Unit instance onto unitDef | Extracted inline UNIT_DEFS type to exported `UnitDefEntry`, added `enrageDef` to it and the `alpha_wolf` entry, replaced the Unit backing field with a getter delegating to `getUnitEnrageDef()`, removed from `toJSON`/`fromJSON` and all spawn configs. Also created `game-object-def-pattern` skill documenting the def-based vs instance-based property classification rule. | 2026-05-31 |

## Hard

| Todo | Notes | Date |
|------|-------|------|
