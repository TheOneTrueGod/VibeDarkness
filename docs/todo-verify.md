# Completed Todos

## Trivial

| Todo | Notes | Date |
|------|-------|------|
| Add `travelFullRange` to `ProjectileLaunchBehaviour` and apply to Throw Rock / Throw Knife | Added `private travelFullRange` field and `withTravelFullRange()` builder to `ProjectileLaunchBehaviour.ts`; `onSetup` uses `maxRange` instead of `dist` when set. Applied to `rockLaunchBehaviour()` in `0107Ability.ts` and `knifeLaunchBehaviour()` in `0109Ability.ts`. | 2026-06-22 |
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
| Add ability-test scenario for Claw (0111) movement distance vs. preview | Created `clawScenarios.ts`; fires Claw toward a pixel 200 px away (beyond max distance), asserts caster lands within 5 px of start + CLAW_MAX_DISTANCE. Exported `CLAW_MAX_DISTANCE`/`CLAW_COLLISION_STEP`. Test passes. | 2026-06-16 |
| Port StoneyPunch (0533) to `selectTargetDefs` | `meleeLineHitbox(MAX_RANGE, 25)` on the `active` interval with `filter: 'enemy'`; removed legacy `targets: [{ type: 'unit' }]`. | 2026-06-16 |
| Port AnchoredTremor (0532) to `selectTargetDefs` | `nullHitbox` `targetDef` on `active` interval; removed legacy `targets`. | 2026-06-16 |
| Port Knock (0531) to `selectTargetDefs` | `nullHitbox` `targetDef` on `active` interval; removed legacy `targets`. | 2026-06-16 |
| Port StoneTomb (0530) to `selectTargetDefs` | `nullHitbox` `targetDef` on `active` interval; removed legacy `targets`. | 2026-06-16 |
| Port Pounce (0702) to `selectTargetDefs` | `nullHitbox` `targetDef` on `dash` interval; removed legacy `targets`. | 2026-06-16 |
| Port Heel (0703) to `selectTargetDefs` | `nullHitbox` `targetDef` on `active` interval; removed legacy `targets`. | 2026-06-16 |
| Port SicEm (0704) to `selectTargetDefs` | `nullHitbox` `targetDef` on `active` interval; removed legacy `targets`; renamed `renderTargetingPreview` → `renderTargetingPreviewSelectedTargets` to preserve pet-sourced movement preview. | 2026-06-16 |
| Port ThornbinderBramble (0008) to `selectTargetDefs` | Created inline `ThornbinderHitboxSpec` that draws the 320 px range circle; added `targetDef` with it to the `strike` interval; removed legacy `targets` and `renderTargetingPreview` method. | 2026-06-16 |
| Port ThrowTorch (0601) to `selectTargetDefs` | Used `nullHitbox` on the `active` interval; renamed `renderTargetingPreview` → `renderTargetingPreviewSelectedTargets` (clamped-line preview via `createPixelTargetPreview`); removed legacy `targets`. | 2026-06-16 |
| Port DiggingClaws (0534) to `selectTargetDefs` | Same direction-pick pattern as Claw: `nullHitbox` on the `dash` interval; renamed `renderTargetingPreview` → `renderTargetingPreviewSelectedTargets` (straight-line preview appropriate for wall-penetrating dash); removed legacy `targets`. | 2026-06-16 |
| Port Dodge (0101) to `selectTargetDefs` | Added `NullHitboxSpec`/`nullHitbox` to `HitboxSpec.ts`; added `targetDef` with `nullHitbox` to the `iframe` timing; renamed `renderTargetingPreview` to `renderTargetingPreviewSelectedTargets` (terrain preview still draws via that hook); removed legacy `targets`. | 2026-06-16 |
| Port Claw (0111) to `selectTargetDefs` | Same direction-pick pattern as Dodge: `nullHitbox` on the `active` timing, `renderTargetingPreviewSelectedTargets` for movement line, `targets: []`. | 2026-06-16 |
| Port EnergyBlast (0114) to `selectTargetDefs` | Created inline `EnergyBlastHitboxSpec` that renders the line/crosshair/explosion preview and returns enemies within `EXPLOSION_RADIUS` of the impact point as soft lock-on candidates; added `targetDef` on `active` timing with `filter: 'enemy', allowMiss: true`; removed legacy `targets` and `renderTargetingPreview`. | 2026-06-16 |
| Remove dead `meleeTrackingHelpers` module | Moved `renderMeleeTrackingHighlights` to `targeting.ts`; inlined `buildHitboxContext` in SwingBat; deleted orphaned `entry/update/aim` helpers, `MeleeTrackingEntry`, `MELEE_TRACKING_TETHER_EXTRA`, and `meleeTrackingHelpers.test.ts`; deleted `meleeTrackingHelpers.ts`. | 2026-06-16 |
| Remove earth core item (`017`) | Deleted `017_core_earth.ts`, its SVG asset, and all registry entries (import, icon map, `ALL_PLAYER_ITEMS`, `ITEMS`) from `items/index.ts`. Earth research node already used `addCard`. | 2026-06-07 |
| Remove beast/air/charged/blink core items (`014`, `018`, `019`, `020`) | Migrated misc tree nodes: Beast Core → `addCard 0111`; Air/Charged/Blink → `effects: []` (placeholders with no distinctive ability). Deleted four item TS files and SVG assets; removed all registry entries from `items/index.ts`. | 2026-06-07 |
| Migrate LaserSword (0105) to castBehaviours | Replaced `doCardEffect`, `beginActiveCast`, `renderTargetingPreview`, and `meleeTrackingHelpers` usage with `CastBehaviours.MeleeAttack().withHitbox().withSlide().withImpactVFX().withDamage()`. Added `targetDef` on the slash timing interval; set `targets: []` and removed `meleeTracking` tag. | 2026-05-31 |
| Migrate SwingBat / 0115 to castBehaviours | Already done — `doCardEffect` removed, `targets: []`, full `CastBehaviours.MeleeAttack()` chain with `targetDef` on the hit interval; todo was stale. | 2026-06-02 |
| Migrate RaiseShield (0104) to castBehaviours | Added `setAbilityNote` to `AbilityEffect` and `AbilityEventRuntime`; replaced `doCardEffect` with an `ON_CAST_START` `abilityEvents` rule that initialises `{ blockCount: 0 }`. | 2026-06-02 |
| Migrate LaserShield (0106) to castBehaviours | Same pattern as RaiseShield — replaced `doCardEffect` with an `ON_CAST_START` `abilityEvents` rule using the new `setAbilityNote` effect. | 2026-06-02 |

## Medium

| Todo | Notes | Date |
|------|-------|------|
| Migrate window globals to `DebugConsoleContext` | Added `BattleDebugBridge` interface + `adminMovePendingUnitId` to `DebugConsoleContext`. BattlePhase registers a bridge on mount (replacing 3 window-global useEffects); snapshot data is written to a `snapshotRef` instead of window globals; admin-pending state lives in context and is synced to `PlayerInteractionManager` via a useEffect. All debug tabs (`DebugConsole`, `DebugUnitsTab`, `DebugGameStateTab`, `DebugBattleActionsTab`, `AdminMoveDebugTool`) updated to call bridge methods instead of window globals. | 2026-06-17 |
| Refactor BattlePhase canvas input handling | `PlayerInteractionManager` already served as the `CanvasInputController`; all debug-tool dispatch (admin move, unit selector, ability targeting, lock-on) was already there. Moved the remaining debug terrain overlay from `handleCanvasMouseMove` into `PlayerInteractionManager.onCanvasMouseMove` and removed the now-unnecessary `forceRender` state (DebugConsole polls `window.__minionBattlesDebugMouse` on its own 100 ms interval). | 2026-06-17 |
| Migrate EnergyBlast (0114) to castBehaviours | Added `ON_PROJECTILE_EXPIRED` to `AbilityEventType`; extended `AbilityEventRuntimeContext` with `projectile`/`hitUnit` fields; added `triggerAbilityEventFromProjectileExpiry` helper; added `triggerAoEExplosion` effect type + handler; created `ProjectileLaunchBehaviour`; added `addProjectile`/`roundNumber` to `AbilityEngineContext`. Replaced `doCardEffect`/`onProjectileExpired`/`onAttackBlocked` with a `ProjectileLaunch` castBehaviour + `ON_PROJECTILE_EXPIRED → triggerAoEExplosion` abilityEvents rule. | 2026-06-02 |
| Migrate EnemyMeleeAttack (0002) to castBehaviours | Rewrote using `defineMeleeStrike` with `meleeLineHitbox(50, 20)`; timings preserved (windup 0.5s, active 0.5s, cooldown 2.5s, `impactAt=1.0`); deleted `doCardEffect`, `GameEngineLike`, and all ability-note boilerplate. | 2026-06-11 |
| Migrate EnemyArcherShot (0001) to castBehaviours | Rewrote using `defineAbility` + `CastBehaviours.ProjectileLaunch()` on the active interval; `withSpeed(800).withMaxRange(280).withBaseDamage(4)` match original constants; real `onAttackBlocked` preserved; deleted `doCardEffect` and ability-note locking. | 2026-06-11 |
| Migrate AlphaWolfClaw (0004) to castBehaviours | Rewrote using `defineAbility` + `convexQuadHitbox(40, 44)` + `MeleeAttack` behaviour; `renderActivePreview` with `drawEnemyConvexQuadHitboxTelegraph` preserved via `HITBOX.getQuadGeometry`; deleted `doCardEffect`, `GameEngineLike`, and local geometry helpers. New `ConvexQuadHitbox` HitboxSpec created as part of this step. | 2026-06-11 |
| Migrate BeastClaw (0611) to castBehaviours | Rewrote using `defineAbility` with two active intervals (slash1/slash2), each using `MeleeAttack().withHitbox(convexQuadHitbox(10, 28))`; slash-trail VFX preserved via `withImpactVFX`; deleted all manual geometry (`getSquareInFront`, `pointInQuad`), `doCardEffect`, and `GameEngineLike`. | 2026-06-11 |
| Migrate Dodge (0101) to castBehaviours | Created `DashBehaviour` (pure movement CastBehaviour); added `effectDuration` + `useCasterVisualData` to `AbilityTimingEmitterDef` for afterimage trail; added `excludeSelf` to `recoverCharge` effect; replaced `doCardEffect` with `emitterDef` + `behaviour` + `ON_CAST_START` abilityEvents rule. | 2026-06-02 |
| Move enrageDef from Unit instance onto unitDef | Extracted inline UNIT_DEFS type to exported `UnitDefEntry`, added `enrageDef` to it and the `alpha_wolf` entry, replaced the Unit backing field with a getter delegating to `getUnitEnrageDef()`, removed from `toJSON`/`fromJSON` and all spawn configs. Also created `game-object-def-pattern` skill documenting the def-based vs instance-based property classification rule. | 2026-05-31 |

## Hard

| Todo | Notes | Date |
|------|-------|------|
| Deduplicate `ROUND_DURATION` in unitAI | Extracted to `game/gameConstants.ts`; `GameEngine.ts` now imports from there; `unitAI/utils.ts` re-exports it; `aggroWander_wander/attack.ts` import from `../utils` instead of declaring locally. `lnet_scout_travel/construct.ts` renamed `ROUND_DURATION_SEC` → `ATTACK_COOLDOWN_SEC` (value 8 is an attack cooldown, not a round duration). | 2026-06-12 |
