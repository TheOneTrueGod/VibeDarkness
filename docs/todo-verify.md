# Completed Todos

## Trivial

| Todo | Notes | Date |
|------|-------|------|
| Modify your ability tests skill. One test per ability | Added "Test design principles" section to ability-tests SKILL.md: one scenario per ability max, combine multiple assertions, require comment if a second scenario is needed. | 2026-05-31 |
| Rename `CardHand.tsx` / `CardComponent.tsx` to ability-focused names | Used `git mv` to rename all 4 files: `CardHand` → `AbilityBar`, `CardComponent` → `AbilitySlot`, `CardTooltip` → `AbilityTooltip`, `CardDescription` → `AbilityDescription`; updated all internal component/interface names, cross-imports, and the `BattlePhase.tsx` usage site. | 2026-06-05 |
| Fix `ChargeAttack` template's reference to `discardDuration` | Already cleaned up as part of the `discardDuration` removal pass — the config field and cardDef assignment were both stripped at that time. | 2026-06-05 |
| Refactor test harness `seedHandWithAbilities()` | Deleted `seedHandWithAbilities`, `TinyBattleHandEntry`, and the now-unused `asCardDefId`/`CardDefId`/`CardInstance` imports from `buildTinyBattleEngine.ts`; stripped all 11 call sites and their `asCardDefId` imports from scenario files. | 2026-06-05 |
| Remove vestigial `CardDef` fields (`id`, `name`, `tags`) | Removed all three fields from the `CardDef` interface; rekeyed `CARD_DEF_MAP` to use `abilityId`; updated `getCardDef` signature; fixed `createCardInstance` lookup; removed `cardName` from `ChargeAttackConfig` and its three call sites; stripped `id:`, `name:`, `tags:`, `cardName:` lines and unused `asCardDefId` imports from all 46 affected card def files. | 2026-06-05 |
| Delete dead `CardManager` draw/hand methods | Removed `drawCard`, `drawCardsForPlayer`, `fillHandInnateFirst`, and `transferCardToAllyDeck` from `CardManager.ts`; removed the three delegate stubs from `GameEngine.ts`; removed the `EngineWithDraw` interface and `drawCardForPlayer` helper from `effectHelpers.ts`; cleaned up the now-unused `Unit` import. | 2026-06-04 |
| Remove `discardDuration` from all card def files | Deleted `DiscardDuration` type and `discardDuration` field from `card_defs/types.ts`; removed config field and cardDef assignment from `ChargeAttack.ts` template; stripped the property line from all 49 card def files. | 2026-06-04 |
| Migrate ImpactConversion (0521) to castBehaviours | Deleted empty `doCardEffect` stub and unused `ResolvedTarget` import from `0521Ability.ts`. | 2026-05-31 |
| Migrate BedrockScavenger (0522) to castBehaviours | Deleted empty `doCardEffect` stub and unused `ResolvedTarget` import from `0522Ability.ts`. | 2026-05-31 |
| Migrate DeepResonance (0523) to castBehaviours | Deleted empty `doCardEffect` stub and unused `ResolvedTarget` import from `0523Ability.ts`. | 2026-05-31 |
| Migrate FaultHarvest (0528) to castBehaviours | Deleted empty `doCardEffect` stub and unused `ResolvedTarget` import from `0528Ability.ts`. | 2026-05-31 |
| Migrate SeismicGuard (0529) to castBehaviours | Deleted empty `doCardEffect` stub and unused `ResolvedTarget` import from `0529Ability.ts`. | 2026-05-31 |

## Easy

| Todo | Notes | Date |
|------|-------|------|
| Remove earth core item (`017`) | Deleted `017_core_earth.ts`, its SVG asset, and all registry entries (import, icon map, `ALL_PLAYER_ITEMS`, `ITEMS`) from `items/index.ts`. Earth research node already used `addCard`. | 2026-06-07 |
| Remove beast/air/charged/blink core items (`014`, `018`, `019`, `020`) | Migrated misc tree nodes: Beast Core → `addCard 0111`; Air/Charged/Blink → `effects: []` (placeholders with no distinctive ability). Deleted four item TS files and SVG assets; removed all registry entries from `items/index.ts`. | 2026-06-07 |
| Migrate LaserSword (0105) to castBehaviours | Replaced `doCardEffect`, `beginActiveCast`, `renderTargetingPreview`, and `meleeTrackingHelpers` usage with `CastBehaviours.MeleeAttack().withHitbox().withSlide().withImpactVFX().withDamage()`. Added `targetDef` on the slash timing interval; set `targets: []` and removed `meleeTracking` tag. | 2026-05-31 |
| Migrate SwingBat / 0115 to castBehaviours | Already done — `doCardEffect` removed, `targets: []`, full `CastBehaviours.MeleeAttack()` chain with `targetDef` on the hit interval; todo was stale. | 2026-06-02 |
| Migrate RaiseShield (0104) to castBehaviours | Added `setAbilityNote` to `AbilityEffect` and `AbilityEventRuntime`; replaced `doCardEffect` with an `ON_CAST_START` `abilityEvents` rule that initialises `{ blockCount: 0 }`. | 2026-06-02 |
| Migrate LaserShield (0106) to castBehaviours | Same pattern as RaiseShield — replaced `doCardEffect` with an `ON_CAST_START` `abilityEvents` rule using the new `setAbilityNote` effect. | 2026-06-02 |

## Medium

| Todo | Notes | Date |
|------|-------|------|
| Migrate EnergyBlast (0114) to castBehaviours | Added `ON_PROJECTILE_EXPIRED` to `AbilityEventType`; extended `AbilityEventRuntimeContext` with `projectile`/`hitUnit` fields; added `triggerAbilityEventFromProjectileExpiry` helper; added `triggerAoEExplosion` effect type + handler; created `ProjectileLaunchBehaviour`; added `addProjectile`/`roundNumber` to `AbilityEngineContext`. Replaced `doCardEffect`/`onProjectileExpired`/`onAttackBlocked` with a `ProjectileLaunch` castBehaviour + `ON_PROJECTILE_EXPIRED → triggerAoEExplosion` abilityEvents rule. | 2026-06-02 |
| Migrate Dodge (0101) to castBehaviours | Created `DashBehaviour` (pure movement CastBehaviour); added `effectDuration` + `useCasterVisualData` to `AbilityTimingEmitterDef` for afterimage trail; added `excludeSelf` to `recoverCharge` effect; replaced `doCardEffect` with `emitterDef` + `behaviour` + `ON_CAST_START` abilityEvents rule. | 2026-06-02 |
| Move enrageDef from Unit instance onto unitDef | Extracted inline UNIT_DEFS type to exported `UnitDefEntry`, added `enrageDef` to it and the `alpha_wolf` entry, replaced the Unit backing field with a getter delegating to `getUnitEnrageDef()`, removed from `toJSON`/`fromJSON` and all spawn configs. Also created `game-object-def-pattern` skill documenting the def-based vs instance-based property classification rule. | 2026-05-31 |

## Hard

| Todo | Notes | Date |
|------|-------|------|
