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
| Migrate SwingBat / 0115 to castBehaviours | Same melee swing family as SwingBat/0103 which is already on `castBehaviours`. Replace `doCardEffect` and `targets` with `MeleeAttackBehaviour` on the hit interval plus a `targetDef`. Use 0103 as the template. |
| Migrate RaiseShield (0104) to castBehaviours | `doCardEffect` only sets an ability note at t = 0.05 s. Replace with an `ON_CAST_START` `abilityEvents` rule that initialises the block-count note; no new CastBehaviour class needed. |
| Migrate LaserShield (0106) to castBehaviours | Identical structure to RaiseShield — `doCardEffect` sets an ability note at t = 0.05 s. Replace with an `ON_CAST_START` `abilityEvents` rule that initialises the block-count note. |

## Medium

| Todo | Notes |
|------|-------|
| Migrate Dodge (0101) to castBehaviours | `doCardEffect` handles per-tick movement displacement, afterimage effect spawning, and a one-shot recovery-charge grant. Movement and afterimage emission should be expressed via a dash CastBehaviour or `emitterDef` on the iframe interval; the recovery charge can move to an `ON_CAST_START` abilityEvents rule. |
| Migrate ShiningBlock (0110) to castBehaviours | `doCardEffect` manages a blocking window with a counter-attack AoE on block success. The counter-attack may need a new CastBehaviour or an `ON_ATTACK_BLOCKED` abilityEvents rule; the blocking window itself is already driven by `getBlockingArc`. |
| Migrate Claw (0111) to castBehaviours | `doCardEffect` applies forced-displacement movement each tick and spawns collision effects. Needs a dash/movement CastBehaviour (similar approach to Dodge); the iframe window is already declared in `abilityTimings`. |
| Migrate AbsorptionShield (0113) to castBehaviours | `doCardEffect` runs absorption logic each tick during the shield window. Convert to a CastBehaviour that manages the absorption phase, or map to abilityEvents hooks that fire on each incoming hit during the active timing window. |
| Migrate EnergyBlast (0114) to castBehaviours | `doCardEffect` fires a projectile at the prefire threshold. Create a projectile-launch CastBehaviour (or a threshold behaviour on the active interval); no research variants, so scope is bounded. |
| Migrate LanterniteStrike (0010) to castBehaviours | `doCardEffect` sets an ability note at LOCK_TIME then fires a projectile at prefire — two threshold effects. Map them to castBehaviours on the windup and active timing intervals; ability-note init can move to `ON_CAST_START`. |
| Migrate EnemyMeleeAttack (0002) to castBehaviours | Enemy basic melee that deals damage at a threshold; likely compatible with the existing `MeleeAttackBehaviour`. Replace `doCardEffect` with that CastBehaviour on the active interval. |
| Migrate Pistol (0203) to castBehaviours | `doCardEffect` fires three shots at staggered time thresholds, each targeting a different target slot. Needs either a multi-shot CastBehaviour or three separate timing intervals each with a projectile CastBehaviour. |
| Migrate SMG (0204) to castBehaviours | `doCardEffect` fires a rapid burst of shots at staggered intervals; same pattern as Pistol. Coordinate with the Pistol migration — a shared gun CastBehaviour that handles burst-fire would cover both. |
| Migrate Shotgun (0205) to castBehaviours | `doCardEffect` fires a spread of simultaneous projectiles from a single origin point. Needs a spread-shot CastBehaviour; design can be shared with the Pistol/SMG gun CastBehaviour system. |
| Migrate AlphaWolfClaw (0004) to castBehaviours | `doCardEffect` spawns a projectile at the prefire threshold. Straightforward mapping to a projectile CastBehaviour on the active timing interval; no research variants. |
| Migrate AlphaWolfSummon (0005) to castBehaviours | `doCardEffect` spawns enemy units at the prefire threshold — unique unit-spawn behavior. Needs a spawn CastBehaviour or an `ON_CAST_TICK` abilityEvents rule with a custom effect to handle the summon. |
| Migrate EarthernPunch (0524) to castBehaviours | `doCardEffect` applies a melee hit at a threshold. Use `MeleeAttackBehaviour` on the active timing interval; earth-core flavour (stone buff) can go through an abilityEvents `ON_ATTACK_HIT` rule. |
| Migrate ShakingGround (0525) to castBehaviours | `doCardEffect` applies an AoE ground-shake effect at a threshold. Convert to a CastBehaviour on the active timing interval for the shockwave; visual can move to `emitterDef`. |
| Migrate Shatter (0526) to castBehaviours | `doCardEffect` fires a projectile at a threshold. Attach a projectile CastBehaviour to the active timing interval; no complex research variants. |
| Migrate StoneTomb (0530) to castBehaviours | `doCardEffect` creates a projectile that generates stone terrain on impact. Convert to a projectile CastBehaviour on the active interval; ensure the stone-creation on-expire side effect is preserved. |
| Migrate Knock (0531) to castBehaviours | `doCardEffect` fires a stone projectile at a threshold. Straightforward projectile CastBehaviour on the active timing interval; stone-terrain side effects handled via `onProjectileExpired`. |
| Migrate AnchoredTremor (0532) to castBehaviours | `doCardEffect` applies repeating pulse damage on each game tick during the active window. Needs a multi-pulse CastBehaviour (or per-interval repeating hits via `enteredTimingIds` logic); more complex than single-threshold abilities. |
| Migrate StoneyPunch (0533) to castBehaviours | `doCardEffect` applies a melee hit that consumes all armour for bonus damage per armour point. Use `MeleeAttackBehaviour` with an armour-consumption side effect; armour drain can go in `ON_ATTACK_HIT` abilityEvents. |
| Migrate BoarClaws (0534) to castBehaviours | `doCardEffect` applies a claw hit at a threshold. Convert to `MeleeAttackBehaviour` on the active timing interval; follow the existing BoarCharge/Claw pattern. |
| Migrate BeastClaw (0611) to castBehaviours | `doCardEffect` handles dash movement plus a hit on impact, similar to Claw (0111). Needs a movement CastBehaviour paired with a hit CastBehaviour; coordinate with the Claw migration. |
| Migrate ThrowTorch (0601) to castBehaviours | `doCardEffect` fires a torch projectile and grants a copy of the torch card to a random ally — a unique side effect. Needs a projectile CastBehaviour plus an `ON_CAST_TICK` or `ON_ATTACK_HIT` abilityEvents rule for the card-grant. |
| Migrate EnemyArcherShot (0001) to castBehaviours | `doCardEffect` sets an ability note at LOCK_TIME (position snapshot) then fires a projectile at prefire — two-phase. Map to castBehaviours on the windup and active intervals; ability-note init can move to `ON_CAST_START`. |

## Hard

| Todo | Notes |
|------|-------|
| Migrate ThrowRock (0107) to castBehaviours | `doCardEffect` branches on the `more_rock` research node: base case fires one projectile at 0.3 s; more_rock fires two at separate thresholds across a different total timeline. The `getAbilityTimings` override already returns different intervals per-research, so castBehaviours on `flight` and `flight2` intervals could handle each throw — but the research-variant CastBehaviour pattern needs to be defined first. |
| Migrate ThrowChargedRock (0108) to castBehaviours | `doCardEffect` fires a charged projectile (with an explosion on impact via `onProjectileExpired`) and has a `more_rock` research variant for a second throw. Scope is similar to ThrowRock; design the projectile+explosion CastBehaviour to handle the per-research timing before implementing. |
| Migrate ThrowKnife (0109) to castBehaviours | `doCardEffect` throws a knife projectile and has a research variant (both `throwing_knives` and `more_rock` nodes) adding a second knife with its own timing window. Coordinate the CastBehaviour design with the ThrowRock and ThrowChargedRock migrations to share a research-aware projectile pattern. |
| Migrate ThornbinderBramble (0008) to castBehaviours | `doCardEffect` creates an AoE hit at the strike threshold and places a persistent slow patch that lasts until shortly before the next cast. The persistent patch lifecycle (tied to round timing) is complex; plan the CastBehaviour and cleanup mechanism before implementing. |
| Migrate HuskSeedBarrage (0009) to castBehaviours | `doCardEffect` runs a complex telegraphed channel — a seed pod arcs to a target zone and spawns ephemeral husk units on landing. Unit-spawning inside a CastBehaviour is a new pattern; design the spawn CastBehaviour and ephemeral unit lifecycle before starting. |
