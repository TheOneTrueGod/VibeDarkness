# TODO

## Uncategorised

| Todo | Notes |
|------|-------|

## Trivial

| Todo | Notes |
|------|-------|

## Easy

| Todo | Notes |
|------|-------|

## Medium

| Todo | Notes |
|------|-------|
| Move `playerResearchTreesByPlayer` off `CardManager` | Research trees are stored on `CardManager` for no conceptual reason and serialized alongside card data in checkpoints. Relocate to `GameState` directly (or a `ResearchManager`) and update serialization accordingly. |
| Make `darkness` a modifier on spawn behaviours, not its own behaviour | Instead of `spawnBehaviour: 'darkness'`, add an `inDarkness: boolean` flag to `SpawnWaveEntry` that can be combined with any `spawnBehaviour` (e.g. `edgeOfMap` + `inDarkness`). Requires updating the types, `LevelEventManager`, and migrating existing `'darkness'` usages. |
| Migrate `.takeDamage(...)` callers to `takeDamageDetailed` where useful | `Unit.takeDamage`/`applyDamageToUnit` are now thin wrappers around `applyDamageToUnitDetailed` (added for the Blood Mage shield-absorption pipeline); 22 call sites across 19 files (found via `grep -rn '\.takeDamage(' app/js`) still only read the flat hp-damage number back. Multi-step cleanup: each pass migrates up to 10 call sites (or leaves a one-line comment if the plain number is genuinely sufficient there), then edit this row's remaining count down, repeating until it reaches 0. Remaining: **22**. |
| Migrate LanterniteStrike (0010) to castBehaviours | `doCardEffect` sets an ability note at LOCK_TIME then fires a projectile at prefire — two threshold effects. Map them to castBehaviours on the windup and active timing intervals; ability-note init can move to `ON_CAST_START`. |
| Migrate Pistol (0203) to castBehaviours | `doCardEffect` fires three shots at staggered time thresholds, each targeting a different target slot. Needs either a multi-shot CastBehaviour or three separate timing intervals each with a projectile CastBehaviour. |
| Migrate SMG (0204) to castBehaviours | `doCardEffect` fires a rapid burst of shots at staggered intervals; same pattern as Pistol. Coordinate with the Pistol migration — a shared gun CastBehaviour that handles burst-fire would cover both. |
| Migrate Shotgun (0205) to castBehaviours | `doCardEffect` fires a spread of simultaneous projectiles from a single origin point. Needs a spread-shot CastBehaviour; design can be shared with the Pistol/SMG gun CastBehaviour system. |
| Migrate AlphaWolfSummon (0005) to castBehaviours | `doCardEffect` spawns enemy units at the prefire threshold — unique unit-spawn behavior. Needs a spawn CastBehaviour or an `ON_CAST_TICK` abilityEvents rule with a custom effect to handle the summon. |
| Migrate EarthernPunch (0524) to castBehaviours | `doCardEffect` applies a melee hit at a threshold. Use `MeleeAttackBehaviour` on the active timing interval; earth-core flavour (stone buff) can go through an abilityEvents `ON_ATTACK_HIT` rule. |
| Migrate ShakingGround (0525) to castBehaviours | `doCardEffect` applies an AoE ground-shake effect at a threshold. Convert to a CastBehaviour on the active timing interval for the shockwave; visual can move to `emitterDef`. |
| Migrate Shatter (0526) to castBehaviours | `doCardEffect` fires a projectile at a threshold. Attach a projectile CastBehaviour to the active timing interval; no complex research variants. |
| Migrate StoneTomb (0530) to castBehaviours | `ProjectileLaunch` pattern established (mirror `0108_ThrowChargedRock`). Convert `doCardEffect` to `ProjectileLaunch` on the active interval; preserve stone-terrain creation on expiry via `ON_PROJECTILE_EXPIRED` abilityEvents rule. |
| Migrate Knock (0531) to castBehaviours | `ProjectileLaunch` pattern established. Convert `doCardEffect` to `ProjectileLaunch` on the active interval; preserve stone-terrain on-expire side effect via `ON_PROJECTILE_EXPIRED`; carry over the `stonephase` projectile modifier. |
| Migrate AnchoredTremor (0532) to castBehaviours | `doCardEffect` applies repeating pulse damage on each game tick during the active window. Needs a multi-pulse CastBehaviour (or per-interval repeating hits via `enteredTimingIds` logic); more complex than single-threshold abilities. |
| Migrate StoneyPunch (0533) to castBehaviours | `doCardEffect` applies a melee hit that consumes all armour for bonus damage per armour point. Use `MeleeAttackBehaviour` with an armour-consumption side effect; armour drain can go in `ON_ATTACK_HIT` abilityEvents. |
| Migrate ThrowTorch (0601) to castBehaviours | `ProjectileLaunch` pattern established. `TorchProjectile` → `LightSource` conversion is engine-side in `EffectManager.gameUpdate` — confirm launch wires into it before editing. Card-grant to random ally may need an `ON_PROJECTILE_EXPIRED` abilityEvents rule. |

## Hard

| Todo | Notes |
|------|-------|
| Remove `CardManager` and card serialization from checkpoints | `CardManager` is serialized into every checkpoint via `GameEngine.toJSON/fromJSON` and `SerializedGameState.cards`. Full removal requires: adding a checkpoint version field, writing migration logic to silently drop the `cards` field on load, then deleting `CardInstance`, `SerializedCardInstance`, and `CardManager` itself. Must be coordinated with the ability-use tracking and research-tree extraction todos above. |
| Migrate ThrowRock (0107) to castBehaviours | `doCardEffect` branches on the `more_rock` research node: base case fires one projectile at 0.3 s; more_rock fires two at separate thresholds across a different total timeline. The `getAbilityTimings` override already returns different intervals per-research, so castBehaviours on `flight` and `flight2` intervals could handle each throw — but the research-variant CastBehaviour pattern needs to be defined first. |
| Migrate ThrowChargedRock (0108) to castBehaviours | `doCardEffect` fires a charged projectile (with an explosion on impact via `onProjectileExpired`) and has a `more_rock` research variant for a second throw. Scope is similar to ThrowRock; design the projectile+explosion CastBehaviour to handle the per-research timing before implementing. |
| Migrate ThrowKnife (0109) to castBehaviours | `doCardEffect` throws a knife projectile and has a research variant (both `throwing_knives` and `more_rock` nodes) adding a second knife with its own timing window. Coordinate the CastBehaviour design with the ThrowRock and ThrowChargedRock migrations to share a research-aware projectile pattern. |
| Migrate ThornbinderBramble (0008) to castBehaviours | `doCardEffect` creates an AoE hit at the strike threshold and places a persistent slow patch that lasts until shortly before the next cast. The persistent patch lifecycle (tied to round timing) is complex; plan the CastBehaviour and cleanup mechanism before implementing. |
| Migrate HuskSeedBarrage (0009) to castBehaviours | `doCardEffect` runs a complex telegraphed channel — a seed pod arcs to a target zone and spawns ephemeral husk units on landing. Unit-spawning inside a CastBehaviour is a new pattern; design the spawn CastBehaviour and ephemeral unit lifecycle before starting. |
| Revisit unifying CastBehaviour and EventTriggeredBehaviour interfaces | The EnergyBlast migration introduces EventTriggeredBehaviour (a one-shot onEventTrigger(ctx)) alongside CastBehaviour (multi-tick lifecycle: onSetup/onTick/onInterrupt). A deeper design question is whether these should eventually be unified. Problems to solve first: (1) Lifecycle mismatch — CastBehaviour maintains per-cast state across ticks via behaviourPayload; EventTriggeredBehaviour is fire-and-forget with no persistent state. (2) Context mismatch — CastBehaviourSetupContext carries windowProgress, isFirstTick, behaviourPayload, castPayload; AbilityEventRuntimeContext carries projectile, hitUnit, eventType — fundamentally different shapes that a unified interface must reconcile (union type, common base, or overloaded entry points). (3) Control flow — CastBehaviours are clock-driven (timing intervals); EventTriggeredBehaviours are event-driven (game events) — a unified API must not muddle which drives which. |
