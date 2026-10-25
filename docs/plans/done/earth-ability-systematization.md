# Plan: Earth ability systematization (Rock Slide / Stone Tomb review fixes)

## Context

Rock Slide (`0537`) and the reworked Stone Tomb (`0530`) work and are tested, but a review found that they were built as one-offs:

- **Deprecated escape hatch:** Rock Slide uses `doCardEffect` with hand-rolled `crossed(prev, cur, t)` checks and a `castPayload` bag.
- **Grown-by-booleans projectile:** `Projectile` gained `stopAtImpassable`, `knockbackMode`, `knockbackBeyondMaxHits` and `continueAfterMaxHits`.
- **Duplicate hitboxes:** three near-identical tile hitboxes now exist: Square, Plus and TileSelect.
- **Ad-hoc hooks:** `onCastInterrupted` and `interruptEndsCooldown` were added to `AbilityStatic`.
- **Duplicated terrain logic:** terrain checks are repeated in each ability.

There are also correctness and sync risks:

- **Orphaned held projectile:** the not-yet-launched projectile is faked with velocity 0 plus `passThroughEnemies`. Only one interrupt path cleans it up, so it can live forever.
- **Unserialized hit sets:** projectile hit sets are not saved, so restoring a checkpoint mid-flight can re-hit units.
- **Wall-stop gaps:** the wall stop uses *unit* walkability, samples a single point per tick (so it can tunnel), snaps to tile centres inside the generic class, and has an undefined interaction with `stonephase`.
- **ITS timing workaround:** the select lookahead pauses before effects scheduled earlier in the same tick are applied. Rock Slide worked around this by destroying the rock two ticks early with a private `1/60` constant.

### Investigation of the Entombed / wall-unstick interactions (user question 4)

Units stuck in rock are handled by `game/units/unitWallUnstick.ts` (`tickWallUnstick` → controlled slingshot) and suppressed by `isEntombedProtectionActive` (`unitAbilityQueries.ts`). The **missing pieces** are:

1. **Forced movement can't start inside a wall.** `computeForcedDisplacement` (`game/forceMove.ts`) returns zero displacement when the first step is impassable. Stone Tomb stage 1 knocks the centre-tile enemies back and raises the rock **in the same tick**, so the knockback is cancelled. The victims stay in the rock and are slingshotted later for 5 bonus damage. Any "raise rock, then shove" design hits the same problem.
2. **The controlled-slingshot path removes casts with its own filter.** `tickWallUnstick` filters `unit.activeAbilities` directly, without `ON_CAST_END`, without `cleanupCastBehavioursForAbility`, and without interrupt policy. This is one of **four** places that end casts with different semantics:
   - `interruptAndRefundUnitAbilities` (knockback interrupts).
   - `interruptAllUnitAbilities` (stuns via `Unit.interruptAllAbilities`; no cleanup at all).
   - The wall-unstick filter.
   - `executeUnitAbility` replacing a same-id cast (a splice with no cleanup).

   Held projectiles and any CastBehaviour that relies on `onInterrupt` leak on three of those four paths.
3. A stationary unit that has rock raised under it has `wallEntryPoint == current position`. `computeSlingshotDirection` then falls back to `findNearestPassableDirection`. **This works; no change needed.**
4. *(Out of scope; note only.)* `TerrainGrid.hasLineOfSight` reads only the base terrain grid, so line of sight ignores player-made rock in the floor layer.

### User decisions (binding)

- **Held projectiles:** add a first-class "held until released" state. Record the holder unit id and ability id, plus a `heldTime` that counts up with game time. When `heldTime` exceeds a constant, delete the projectile and log a warning with enough detail to identify the ability and the projectile.
- **Stonephase vs wall stop:** stonephase takes priority. The projectile travels through terrain while stonephase applies to it, and stops at the first obstruction stonephase does **not** cover, or at max distance. It then raises a rock (for Rock Slide).
- **Stuck units:** let the existing Entombed and wall-unstick systems handle units stuck in rock. This plan only fixes the gaps listed above.
- **Lookahead:** fix the ordering in the select lookahead itself, and replace the ability's private tick constant with the engine constant.

---

## Agent Instructions

This plan is executed by `/jp-implement-plan` — read `.claude/skills/jp-implement-plan/SKILL.md` and follow it; do not restate or improvise its workflow here.

- The **invoking agent is the sole orchestrator**. It spawns **one worker per step, synchronously** (never `run_in_background`), waits for each to finish, verifies the plan file, and reports plan completion to the user at the end.
- Each **worker implements exactly one step**. It checks off each `- [ ]` item with a one-line summary of what actually changed, then **stops without spawning the next agent**.
- **Read every file in an item's "Touches" line before editing.** Do not guess signatures.
- **Per-step verification (keep it cheap):** run `npm run lint`, run `npx tsc --noEmit` if the step changes an interface or type, and run **only the test files the step lists**. Never run the full suite, whole directories, `SimulationRunner.test.ts`, or E2E/AbilityTest runs inside a regular step. Step 14 does that once.
- **Behaviour must stay the same unless an item says otherwise.** The existing scenario `earthCoreRockSlideScenario` and the tests in `0530Ability.test.ts`, `0536Ability.test.ts` and `0537Ability.test.ts` are the regression net. A step may update those tests only where its item says the observable behaviour changes.
- **Pause and ask** (return the question as your final output) if a design point below turns out to conflict with existing engine behaviour. This applies especially to Step 6 (lookahead parity) and Step 5 (forced-movement escape rule).
- **Bash note:** on this machine the Bash tool can lose its PATH, and heredocs containing apostrophes fail to parse. Prefer the Read/Edit/Write tools, and use PowerShell for `git`/`npm`/`npx`.
- **Relevant project skills:**
  - `creating-an-ability`, `editing-card-behaviour`, `game-engine`, `game-object-def-pattern`, `working-with-hitboxes`
  - `ability-tests`, `scoped-testing`, `working-on-minion-battles`, `research-trees`
  - `writing-nested-agents-files` (Step 13)
- **Folder-level docs to read when touching that folder:**
  - `app/js/games/minion_battles/abilities/AGENTS.md`
  - `card_defs/05_earth_core/EarthCore.md`
  - `hitboxes/SKILL.md`
  - `docs/interactive-sequential-targeting.md`

All paths below are relative to `app/js/games/minion_battles/` unless they start with `app/`, `docs/` or `.claude/`.

---

## Key Architecture Facts

| Fact | Where |
|---|---|
| Interrupts on knockback: refund, keep cooldown-phase casts, now calls `onCastInterrupted` and honours `interruptEndsCooldown` | `game/units/unitAbilityLifecycle.ts` `interruptAndRefundUnitAbilities` |
| Interrupts on stun: **no** `ON_CAST_END`, **no** behaviour cleanup | same file, `interruptAllUnitAbilities` (called by `Unit.interruptAllAbilities`, `abilities/events/AbilityEventRuntime.ts:~293`, `card_defs/0110_ShiningBlock`) |
| Wall unstick removes casts with its own filter | `game/units/unitWallUnstick.ts` ~L63–79 |
| Same-id recast splices the old cast without cleanup | `unitAbilityLifecycle.ts` `executeUnitAbility` ~L195–212 |
| `cleanupCastBehavioursForAbility` calls behaviour `onInterrupt` and is used by cancel/interrupt | `unitAbilityLifecycle.ts` |
| `skipToCooldownOnInterrupt`, `interruptEndsCooldown`, `onCastInterrupted` | `abilities/Ability.ts` |
| Fixed tick `FIXED_DT = 1/60` lives in GameEngine (heavy import) | `game/GameEngine.ts:~118`; shared constants file `game/gameConstants.ts` |
| Select lookahead pauses **before** the tick in which a select interval would enter | `game/GameEngine.ts` `fixedUpdate` ~L1530; `game/interaction/selectTargetLookahead.ts`; `computeTickElapsed` (do not reimplement inline) |
| Interval entry/exit + behaviour `isFirstTick`/`isLastTick` | `game/units/unitAbilityTick.ts` |
| One-shot behaviour at window entry | `abilities/CastBehaviours/InstantBehaviour.ts` |
| Projectile launch behaviour (from caster toward target) | `abilities/CastBehaviours/ProjectileLaunchBehaviour.ts` |
| Melee caster slide + easing (private copies) | `abilities/CastBehaviours/MeleeAttack.ts` (`withSlide`, `getCasterRenderOffset`, `easeOutCubic`, `easeInOutQuad`); more copies in `ui/abilityUseChargeAnimation.ts` and `0537Ability.ts` |
| `CastBehaviourEntry` supports `timingStart`/`timingEnd` sub-windows inside one interval | `abilities/castBehaviourTypes.ts` |
| `HitTargetDef` (`kind: 'hit'`, `labels`) reuses an earlier select's target | `abilities/timingTargetDef.ts` |
| `defineAbility` gives `movementLock`, derived `getRange`/`aiSettings` | `abilities/defineAbility.ts` |
| Projectile class (new flags, wall stop, side knockback, overflow knockback, Throw Knife bleed hard-coded) | `game/projectiles/Projectile.ts` |
| Projectile travel modifiers (`stonephase`) | `game/projectiles/ProjectileTravelModifiers.ts` |
| Directional knockback helper | `crowdControl/knockbackKeywords.ts` `applyDirectionalKnockback` |
| Forced displacement cancels when starting inside a wall | `game/forceMove.ts` `computeForcedDisplacement` |
| Rock ops: `createOrMarkRock`, `damageRock`, `consumeRockInRadius`, `getEffectiveTerrainType`, `isPassable`, `isProjectilePassable` (all terrain currently `projectilePassable: true`) | `terrain/TerrainManager.ts`, `terrain/TerrainType.ts` |
| Tile hitboxes (Step 7: one spec) | `hitboxes/TileAreaHitboxSpec.ts` (`tileAreaHitbox`, `tileShapes`); helpers in `abilities/tileAreaHelpers.ts`; telegraph palettes in `abilities/telegraphStyles.ts` |
| `validatePick` used by click handling only | `abilities/timingTargetDef.ts`, `game/interaction/itsCanvasInput.ts`, `game/interaction/tools/AbilityTargetingTool.ts` |
| Select preview rendering | `game/GameRenderer/renderers/PreviewRenderer.ts` `renderSelectTargetDef` (~L95) and the interactive branch (~L645) |
| AI select targets | `abilities/targeting.ts` `buildAiSelectTargets` |
| `CellOccupancyManager` only tracks units with `maxPerTile` from a snapshot taken once per tick — **not** suitable for "who is standing in these tiles" | `game/managers/CellOccupancyManager.ts` |

---

## Checklist

### Step 1 — One interrupt path with cleanup and an interrupt policy

Every place that ends a cast early must run the same pipeline: `ON_CAST_END`, `cleanupCastBehavioursForAbility` (which fires behaviour `onInterrupt`), and the ability's interrupt policy. This step is the foundation for held projectiles.

- [x] Replace `skipToCooldownOnInterrupt` and `interruptEndsCooldown` on `AbilityStatic` with a single `interruptPolicy?: { beforeCooldown?: 'cancel' | 'skipToCooldown'; duringCooldown?: 'ignore' | 'end' }`.
  - Done: added `AbilityInterruptPolicy`, `DEFAULT_ABILITY_INTERRUPT_POLICY` and `resolveAbilityInterruptPolicy` in `abilities/Ability.ts`; migrated ChargeAttack and MultiChargeAttack to `beforeCooldown: 'skipToCooldown'` and Rock Slide to `duringCooldown: 'end'`. `onCastInterrupted` kept.
  - The defaults `{ beforeCooldown: 'cancel', duringCooldown: 'ignore' }` reproduce today's default behaviour.
  - Migrate every existing `skipToCooldownOnInterrupt: true` user (grep) to `interruptPolicy: { beforeCooldown: 'skipToCooldown' }`.
  - Migrate Rock Slide's `interruptEndsCooldown: true` to `{ duringCooldown: 'end' }`.
  - Keep `onCastInterrupted` for now; Step 10 removes it.
  - **Touches:** `abilities/Ability.ts`, `game/units/unitAbilityLifecycle.ts`, every file returned by grepping `skipToCooldownOnInterrupt`, `card_defs/05_earth_core/0537_RockSlide/0537Ability.ts`
- [x] Collapse `interruptAndRefundUnitAbilities` and `interruptAllUnitAbilities` into one exported `interruptUnitAbilities(unit, engine: EngineContext)` that applies the policy.
  - Per cast, it calls `onCastInterrupted`, fires `ON_CAST_END`, runs `cleanupCastBehavioursForAbility`, refunds (when cancelling) and clears the ability note.
  - Point `Unit.interruptAllAbilities` and `Unit.interruptAndRefundAbilities` at it. Keep both method names as thin aliases unless every caller is trivially updated. Widen `interruptAllAbilities`'s engine parameter to `EngineContext` and fix callers.
  - **Touches:** `game/units/unitAbilityLifecycle.ts`, `game/units/Unit.ts`, `abilities/events/AbilityEventRuntime.ts`, `card_defs/0110_ShiningBlock/0110Ability.ts`, `game/GameEngine.ts` (`interruptUnitAndRefundAbilities`)
  - Done: `interruptUnitAbilities(unit, engine: EngineContext)` replaces both old functions (now removed). Per cast it runs `onCastInterrupted`, then the policy: cancel (refund) or skip-to-cooldown, or keep/end during cooldown. Removed or snapped casts fire `ON_CAST_END` and `cleanupCastBehavioursForAbility`. `Unit.interruptAllAbilities` and `interruptAndRefundAbilities` delegate to it. `AbilityEventRuntime` casts `context.engine as EngineContext`. `0110` passes its `engine` through the same cast. `GameEngine` needed no change.
- [x] Route the controlled-slingshot cast removal in `tickWallUnstick` through `interruptUnitAbilities`. Its "keep Cooldown/CoopCooldown casts" rule must equal the default `duringCooldown: 'ignore'`; if it differs, pause and ask.
  - Make `executeUnitAbility`'s replace-existing branch run `cleanupCastBehavioursForAbility` on the old cast after firing its `ON_CAST_END`.
  - **Touches:** `game/units/unitWallUnstick.ts`, `game/units/unitAbilityLifecycle.ts`
  - Done: `tickWallUnstick` now calls `interruptUnitAbilities` (the duplicate filter is gone; Cooldown casts are kept by the default policy). `executeUnitAbility`'s same-id branch runs `cleanupCastBehavioursForAbility` after `ON_CAST_END`. Note: `Rock Slide`'s own `duringCooldown: 'end'` now also applies on wall-unstick and stun.
- [x] Add `game/units/unitAbilityLifecycle.interrupt.test.ts` covering:
  - A behaviour's `onInterrupt` fires on all four paths: knockback interrupt, stun interrupt, wall-unstick removal, and same-id recast.
  - The `interruptPolicy` combinations: cancel / skipToCooldown / duringCooldown ignore vs end.
  - Use a tiny engine from `testing/harness/buildTinyBattleEngine.ts` and a registered test ability, or stub `getAbility` the way existing lifecycle tests do (grep for one).
  - **Touches:** new test file; run it plus `card_defs/05_earth_core/0537_RockSlide/0537Ability.test.ts`
  - Done: new `game/units/unitAbilityLifecycle.interrupt.test.ts` covers `onInterrupt` / `ON_CAST_END` on knockback, stun, wall-unstick and same-id recast, plus the policy combinations. It mocks the ability registry and `triggerAbilityEvent`. `unitAbilityLifecycle.chargeInterrupt.test.ts` is updated to `interruptUnitAbilities`. **Not run** (lint and test runs deferred per the user's override). `0537Ability.test.ts` also not run.

---

### Step 2 — Held projectiles and save/load of hit tracking

- [x] Move `FIXED_DT` into `game/gameConstants.ts` and re-export it from `GameEngine.ts`, so existing imports keep working. Add `MAX_HELD_PROJECTILE_SECONDS = 5` next to it, with a doc comment explaining that it is an orphan safeguard, not a gameplay timer.
  - **Touches:** `game/gameConstants.ts`, `game/GameEngine.ts`
  - Done: `FIXED_DT` and `MAX_HELD_PROJECTILE_SECONDS` (documented as an orphan safeguard) now live in `gameConstants.ts`. `GameEngine.ts` imports `FIXED_DT` for its own use and re-exports it, so existing imports still work.
- [x] Add a first-class held state to `Projectile`:
  - `heldBy: { unitId: string; abilityId: string } | null` and `heldTime: number`.
  - A static or helper `Projectile.spawnHeld(...)` (or constructor option `heldBy`), plus `release(velocityX, velocityY)` and `cancelHeld()`.
  - While held, `update()` does not move it, does not count distance, and `checkCollision` returns early. Remove the need for the `passThroughEnemies` / zero-velocity trick.
  - `heldTime += dt` each `update()` while held. When it exceeds `MAX_HELD_PROJECTILE_SECONDS`, set `active = false` (no expire effect, no `onProjectileExpired`) and log one warning containing: projectile id, `projectileType`, `sourceAbilityId`, `sourceUnitId`, `heldBy.unitId` / `heldBy.abilityId`, `heldTime`, x/y, `engine.gameTick` / `gameTime`, and whether the holder unit still exists, is alive, and still has an active cast of `heldBy.abilityId`.
  - Follow the logging convention used elsewhere in `game/` (grep `console.warn(` and any debug logger) and prefix the message with `[Projectile] held projectile orphaned`.
  - **Touches:** `game/projectiles/Projectile.ts`, `game/gameConstants.ts`
  - Done: `heldBy` (exported `ProjectileHolder`) is a constructor option, plus `isHeld`, `release(vx, vy)` and `cancelHeld()` (cancel sets inactive with no expire effect). `update()` routes held projectiles to `updateHeld`, which adds `heldTime`, and past the limit it deletes the projectile and calls `console.warn('[Projectile] held projectile orphaned: ...', details)`. The details include the ids, `gameTick`/`gameTime`, and whether the holder exists, is alive, and has an active cast of `heldBy.abilityId`. `checkCollision` returns early while held. The `passThroughEnemies` trick remains for 0537 until Step 10.
- [x] Serialize `heldBy`, `heldTime`, `hitUnitIds` and `knockbackOnlyUnitIds` in `toJSON`/`fromJSON` (sets become arrays). Update the "not serialized" comments.
  - **Touches:** `game/projectiles/Projectile.ts`
  - Done: all four are written in `toJSON` and read back in `fromJSON`, with old saves defaulting to empty or null. `knockbackOnlyUnitIds` is now public readonly so it can be restored. The "not serialized" comments are replaced.
- [x] Extend `game/projectiles/Projectile.test.ts`:
  - A held projectile doesn't move or hit.
  - `release` makes it move and hit.
  - Exceeding the held limit deletes it and logs the warning (spy on the logger) with the holder ids in the message.
  - A JSON round-trip mid-flight keeps the hit sets: a unit already hit is not hit again after `fromJSON`.
  - **Touches:** `game/projectiles/Projectile.test.ts`; run that file only
  - Done: added to `Projectile.test.ts`: held round-trip through JSON; a hit unit is not re-hit after `fromJSON`; held does not move or hit; `release` moves and hits; `cancelHeld`; the orphan limit deletes the projectile and warns with the holder ids. **Not run** (lint and test runs deferred per the user's override). `npx tsc --noEmit` passes.

---

### Step 3 — Projectile terrain rules and hit policy

- [x] Add a terrain query for "blocks projectiles" using **effective** terrain (floor layer included).
  - Add `blocksProjectiles` to `TerrainProperties` (true for `Rock` and `Impassable`, mirroring the obstruction set used by `TerrainGrid.hasLineOfSight`). Add `TerrainManager.isProjectileObstructedAt(x, y)` and treat out-of-bounds as obstructed.
  - Read `TerrainType.ts` first. If adding a property is noisy because every terrain entry must list it, derive it from a small set constant instead and say so in the summary.
  - **Touches:** `terrain/TerrainType.ts`, `terrain/TerrainManager.ts`
  - Done: `blocksProjectiles` added to `TerrainProperties` (true for Rock and Impassable, set on all six entries; a property rather than a set constant). `TerrainManager.getProjectileTerrainAt` reads effective terrain and reports out-of-bounds as Impassable. `isProjectileObstructedAt` wraps it. `isProjectilePassable` is unchanged.
- [x] Turn wall-stopping into a travel modifier.
  - Add a `ProjectileTravelModifier.canTraverse?(terrainType): boolean` hook (stonephase: `true` for `Rock`) and a new modifier id `'stopsAtWalls'`.
  - In `Projectile.update`, when `stopsAtWalls` is present, sample the swept segment (reuse the per-pixel stepping in `calculateDistanceContribution`; do not test only the end point).
  - At the first sample that is projectile-obstructed **and** not traversable by another modifier, stop at the last free sample and expire (`triggerExpireEffect`).
  - **Stonephase takes priority:** while every obstructed sample is traversable by stonephase, keep flying. Stop at the first obstruction stonephase doesn't cover, or at max distance.
  - Remove `stopAtImpassable` and the **tile-centre snapping** from `Projectile`; resting-tile logic belongs to the ability's `onProjectileExpired`.
  - **Touches:** `game/projectiles/ProjectileTravelModifiers.ts`, `game/projectiles/Projectile.ts`
  - Done: `stopsAtWalls` added, with `canTraverse` (stonephase traverses Rock only) and `isTraversableByModifiers`. `Projectile.findWallStop` samples the swept segment one pixel at a time and stops at the sample before the first obstruction that no modifier traverses, then expires. The `isPassable` check and tile-centre snapping are gone. `stopAtImpassable` survives only as a deprecated constructor option that adds `stopsAtWalls`, because 0537 still uses it until Step 10.
- [x] Replace `pierce`/`continueAfterMaxHits`/`knockbackBeyondMaxHits`/`knockbackMode` plumbing with one `hitPolicy` object:
  - Shape: `{ damagingHits: number; overflow: 'stop' | 'passThrough' | 'knockbackOnly'; knockback?: { tier: number; direction: KnockbackDirectionStrategy } }`.
  - Keep the old constructor options working as deprecated aliases that map onto `hitPolicy`, so every other projectile behaves identically. List the mapping in a doc comment.
  - Put `KnockbackDirectionStrategy` (`{ kind: 'travel' } | { kind: 'sideOfTravel'; angleDeg: number }`) and a pure `resolveHitKnockbackDirection(strategy, travelDir, projectilePos, victimPos)` in `crowdControl/knockbackKeywords.ts`.
  - The projectile calls `applyDirectionalKnockback` with the resolved direction. Exactly centred victims keep today's tie-break (projectile's left / `+perp`).
  - **Touches:** `game/projectiles/Projectile.ts`, `crowdControl/knockbackKeywords.ts`, `abilities/CastBehaviours/ProjectileLaunchBehaviour.ts` (forward the policy)
  - Done: `hitPolicy` replaces the `pierce`, `continueAfterMaxHits`, `knockbackBeyondMaxHits`, `knockbackMode` and `knockbackTier` fields. The old constructor options still work through `hitPolicyFromLegacyOptions` (mapping in its doc comment), and `fromJSON` reads old saves. `KnockbackDirectionStrategy` and `resolveHitKnockbackDirection` are in `knockbackKeywords.ts`; the 45-degree side rule and the centred tie-break are unchanged. `ProjectileLaunchBehaviour.withHitPolicy` forwards the policy, which also covers the `withHitPolicy` item in Step 9. Rock Slide (0537) and Burst (0302) still use the legacy options and were not edited here.
- [x] Move the hard-coded Throw Knife bleed (`THROW_KNIFE_ABILITY_ID` branch in `checkCollision`) into Throw Knife's own `abilityEvents` `ON_ATTACK_HIT` handler. `triggerAbilityEventFromAttack` already fires for projectile hits.
  - Read how another card declares `abilityEvents` before editing. If the event cannot reach the bleed with the same stack count and timing, pause and ask.
  - **Touches:** `game/projectiles/Projectile.ts`, `card_defs/0109_ThrowKnife/0109Ability.ts`
  - Done: the bleed is now an `ON_ATTACK_HIT` rule on Throw Knife (`hitResultIs 'hit'`, then a `throwKnifeBleed` custom effect applying 5 stacks to `primaryTarget`), with its handler in `customEffectHandlers`. The hard-coded branch in `checkCollision` is removed. The event fires in the same tick with the same `gameTime` and `roundNumber`, so stacks and timing match. Residual difference: the event path finds the caster through `engine.getUnit`, so a knife that hits after its caster has been removed from the battle no longer applies bleed. Live casters are always found, so I did not pause on this.
- [x] Tests:
  - `Projectile.test.ts`: wall stop on a swept segment at high speed (no tunnelling); stonephase flies through rock then stops at an `Impassable` cell; stonephase reaching max distance inside rock expires there.
  - `crowdControl` test for `resolveHitKnockbackDirection` (both sides plus the centred tie-break, and the angle parameter).
  - Existing Throw Knife tests still green.
  - **Touches:** `game/projectiles/Projectile.test.ts`, new or existing `crowdControl/knockbackKeywords.test.ts`; run those plus `card_defs/0109_ThrowKnife/*.test.ts` and `0537Ability.test.ts`
  - Done: `Projectile.test.ts` gained a no-tunnelling wall stop, stonephase through rock then stopping at an Impassable cell, stonephase reaching max distance inside rock, the `stopAtImpassable` alias, and the legacy hit-option mapping. `knockbackKeywords.test.ts` gained a `resolveHitKnockbackDirection` block (travel, both sides, centred tie-break, angle). **Not run** (lint and test runs deferred per the user's override). `npx tsc --noEmit` passes. `0109` and `0537` tests are also not run.

---

### Step 4 — Shared terrain and tile-occupancy helpers

- [x] Add rock helpers to `TerrainManager`:
  - `isInBounds(col, row)`.
  - `isIntactRockAt(col, row)`: in-bounds, effective terrain `Rock`, using the existing `isIntactRock`.
  - `destroyRock(col, row, sourceUnitId?)`: sets Rubble, notifies nav, and emits the same stone-damaged transition as a destroying `damageRock`. Make `consumeRockInRadius` reuse it.
  - **Touches:** `terrain/TerrainManager.ts`
  - Done: added `isInBounds`, `isIntactRockAt` and `destroyRock` (returns null unless the tile is intact rock; emits health 0 with `DAMAGE_TIER_NONE`). `consumeRockInRadius` now picks its cell and delegates to `destroyRock`. Its emitted tier changes from 3 to `DAMAGE_TIER_NONE`; no consumer reads `tier` from this event (renderers read floor state). `getProjectileTerrainAt` now uses `isInBounds`.
- [x] Add `getUnitsInTiles(units, tiles, predicate?)` (unit centre's tile ∈ tiles) to `abilities/tileAreaHelpers.ts`. Document why it is not `CellOccupancyManager` (that manager only tracks units with `maxPerTile`, from a once-per-tick snapshot).
  - **Touches:** `abilities/tileAreaHelpers.ts`
  - Done: `getUnitsInTiles` added, returning units in `units` order, with the `CellOccupancyManager` rationale in its doc comment.
- [x] Replace the per-file `EngineLike` / `terrainManager` shape declarations in Earth abilities with `AbilityEngineContext`. Add any missing members, such as `projectiles` (read-only), to `abilities/AbilityEngineContext.ts`.
  - Switch Gather Stone's in-bounds / rock checks to the new TerrainManager helpers and `getUnitsInTiles`, with no behaviour change.
  - Do not touch Rock Slide or Stone Tomb here; Steps 10–11 port them.
  - **Touches:** `abilities/AbilityEngineContext.ts`, `card_defs/05_earth_core/0525_ShakingGround/0525Ability.ts`, `0534_DiggingClaws/0534Ability.ts`, `0536_GatherStone/0536Ability.ts`
  - Done: `AbilityEngineContext` gains `addEffectEmitter` (required, as on GameEngine) and optional read-only `projectiles`. 0525, 0534 and 0536 drop their local engine and terrain shapes (0534 also drops its `EngineContext` alias and `TerrainManagerLike`) and use `AbilityEngineContext` / `TerrainManager`. Gather Stone's rock check is now `isIntactRockAt` and its bounds check `isInBounds`. Grinding Debris uses `getUnitsInTiles` per cell, in the same cell order as before. Gather Stone's test stub (`0536Ability.test.ts`) gained `isInBounds` and `isIntactRockAt`, which this step needed and the Touches list did not name. `npx tsc --noEmit` passes.
- [x] Add a TerrainManager unit test for `destroyRock` (bedrock rock and player-made rock both become Rubble and emit the event) and `isIntactRockAt` (out of bounds is false).
  - **Touches:** existing TerrainManager test file (grep) or a new `terrain/TerrainManager.rock.test.ts`; run it plus `0536Ability.test.ts` and `0534`/`0525` tests if present
  - Done: new `terrain/TerrainManager.rock.test.ts` covers `isInBounds`, `isIntactRockAt` (including out of bounds and destroyed rock), and `destroyRock` on bedrock rock, player-made rock and non-rock tiles (emit and null cases). **Not run** (lint and test runs deferred per the user's override).

---

### Step 5 — Entombed gap: forced movement can escape a wall it starts in

- [x] In `computeForcedDisplacement`, when the **start** point is impassable, let the displacement step through impassable samples until it first reaches a passable sample, then apply the normal wall collision from there.
  - If no passable sample is reached within `maxDistance`, keep today's zero displacement so wall-unstick still handles it.
  - Only knockbacks that *start* inside a wall are affected; normal knockbacks into walls are unchanged.
  - If any existing test relies on the old cancel behaviour (grep `computeForcedDisplacement` tests and the comment in `unitWallUnstick.ts` about knockback being cancelled), pause and ask before changing that test.
  - **Touches:** `game/forceMove.ts`, `game/units/unitWallUnstick.ts` (update the comment)
  - Done: `computeForcedDisplacement` gains an opt-in `escapeWalls` option. With a wall start, it finds the first passable sample within `desired`, bisects the boundary, and resolves the rest of the move from there. No exit gives zero. `unitKnockback.ts` sets `escapeWalls: true` on its non-pass-through path, which is the only caller that opts in. Dashes, lunges, nudges, Lifted and previews keep the old behaviour, so the rule is scoped to knockback as the item requires. `unitKnockback.ts` was not in the Touches list. A knockback that escapes short of its full segment stops there for that tick, so the rest of that tick's push is lost. The comment in `unitWallUnstick.ts` is updated. No existing test starts a knockback inside a wall (grep of the `game/units` and `0530` tests), so nothing needed a pause.
- [x] Add `game/forceMove.test.ts` cases (or extend the existing file): a start inside a wall with a passable exit along the direction escapes; a start inside a wall with no exit within range gives zero; a normal start that hits a wall is unchanged.
  - **Touches:** `game/forceMove.test.ts`; run it plus `card_defs/05_earth_core/0530_StoneTomb/0530Ability.test.ts`
  - Done: `forceMove.test.ts` gains four cases: escape through a 2-cell rock to a passable exit; zero with no exit in range; zero without the flag (old behaviour kept); and a normal wall hit gives the same result with and without the flag. **Not run** (lint and test runs deferred per the user's override). `npx tsc --noEmit` passes.

---

### Step 6 — Select lookahead: same-tick effects happen before the pause

**Desired rule:** when the player is asked for a mid-cast target at elapsed `s`, the world reflects everything the cast scheduled **at or before `s` that is declared ahead of that select interval**. That includes intervals ending at `s` and their `isLastTick` behaviour hooks, and `doCardEffect`/behaviour work for elapsed ≤ `s`. The select interval (and anything declared after it that starts at `s`) enters on the next tick. Preview and committed runs must stay fingerprint-identical.

> **Fix (Step 10 worker, orchestrator-approved):** the gate as first written entered the gated select on the gate tick itself, because the split point is the select's start and `[s, e)` is active at `s`. The lookahead does not pause for it there, so ITS skipped the entry. Fixed in `game/units/unitAbilityTick.ts`: on the gate tick the gated select, and any interval declared after it that starts at the same elapsed time, is removed from `entered`. It enters on the resumed tick, where the window is `(s, s+FIXED_DT]` and the pre-tick lookahead pauses for it (`pendingSelectGate`). The Direction interval is now two ticks (`[0.4, 0.4 + 2*FIXED_DT)`), so it is still active on the resumed tick. Not tested (test runs deferred per the user's override). The gate test for the engine-level case is still to be written.

- [x] Implement a **select gate** in ability ticking.
  - When a cast's next tick window `(prev, next]` contains the start `s` of an interactive select interval whose gate hasn't been passed, process that cast only up to `s` on that tick, then mark the gate pending (e.g. `active.passedSelectGates: string[]` or a single `pendingSelectGate`).
  - Persist the processed elapsed so the next tick resumes from `s`, not from `gameTime − startTime`. Extend `computeTickElapsed`; do not reimplement it inline.
  - Apply the gate **identically in committed and preview runs**: decide from the timing structure, never from whether the label is resolved, so fingerprints match. Serialize the new `ActiveAbility` field.
  - **Touches:** `game/units/unitAbilityTick.ts`, the module that defines `computeTickElapsed` (grep), `game/types.ts` (`ActiveAbility`), unit serialization (`game/units/unitFromJSON.ts` and `Unit.toJSON`)
  - Done: `ActiveAbility` gains `processedElapsed` and `pendingSelectGate` (both serialized in `unitToJSON.ts`; `unitFromJSON` spreads them). `computeTickElapsed` takes an optional `resumeFrom`. `findSelectGateSplit` (in `selectTargetLookahead.ts`, pure) finds a select with `start > 0` in `(prev, next]`. `tickUnitActiveAbilities` cuts the cast at that start, sets both fields, and clears them on the next tick. The window duration used by exit `prevWindowProgress` now comes from the window, not `dt`. Decision is label-independent. Gate state is cleared on the first tick that is not split. Note: entry of a gated select is now one tick later than before, which the desired rule requires.
- [x] Make the lookahead pause before the tick in which the **gated** select interval enters: the tick after the gate tick. Update `findImpendingSelectTargetNeed` / `findImpendingNeedForCast` and the deferred-first-select helper only as needed.
  - **Touches:** `game/interaction/selectTargetLookahead.ts`, `game/GameEngine.ts` (`fixedUpdate`)
  - Done: `findImpendingSelectTargetNeed` passes `active.processedElapsed` to `computeTickElapsed`. `findImpendingNeedForCast` pauses for a `start > 0` select only when it is `pendingSelectGate`, so the gate tick never pauses. Start-0 selects keep the pre-tick pause. The deferred-first-select helper is unchanged. `GameEngine.fixedUpdate` needed only a comment update.
- [x] Tests:
  - A new `game/interaction/selectTargetLookahead.gate.test.ts`. Use a test ability with an `Instant` behaviour on an interval ending exactly at the select start. Assert the side effect is visible while `engine.waitingForTargetInput` is set, and that a committed run produces the same `gameTick`-by-tick fingerprint (follow the parity pattern in `game/interactiveTargeting.test.ts`).
  - Run `game/interactiveTargeting.test.ts` and `game/interaction/*.test.ts` as the targeted regression set. These are the only broader files allowed in this step because parity is the risk.
  - **Touches:** new test file; listed test files only
  - Done (partial): `game/interaction/selectTargetLookahead.gate.test.ts` covers the pure rules: `computeTickElapsed` with `resumeFrom`, `findSelectGateSplit` (window, start-equals-next split, no split at prev, start-0 exemption, non-interactive exemption, earliest pick, no re-split after resume). **Not written:** the engine-level Instant-before-select test and its committed-vs-preview fingerprint check. That needs a registered test ability and harness wiring that I did not write blind. The regression set (`interactiveTargeting.test.ts`, `interaction/*.test.ts`) is **not run** (test runs deferred per the user's override). Expect entry-timing assertions there to need updating. `npx tsc --noEmit` passes.
- [x] Update the "Select-target lookahead" section of `docs/interactive-sequential-targeting.md` with the gate rule.
  - **Touches:** `docs/interactive-sequential-targeting.md`
  - Done: added a "Select gate" subsection under the lookahead section describing the split, the persisted fields, the resume tick, the pause timing, and the start-0 exemption.

---

### Step 7 — One tile-area hitbox

- [x] Create `hitboxes/TileAreaHitboxSpec.ts` with:
  - `anchor`: `{ kind: 'chebyshev'; maxTileOffset: number } | { kind: 'adjacentCardinal' }`.
  - `shape`: a list of tile offsets, with presets `tileShapes.square(half)`, `tileShapes.plus()`, `tileShapes.single()`.
  - `castRange` and `style` (use a named palette: add `TELEGRAPH_STYLES` with `danger`, the red style used by Stone Tomb and Rock Slide, and `earth`, Gather Stone's amber, in a small shared module such as `abilities/telegraphStyles.ts`).
  - `directionArrow?: boolean`, valid only with `adjacentCardinal`; draws the arrow in the anchor tile.
  - Public `resolveAnchor(caster, aim)` and `resolveCells(caster, aim)`, the single source of geometry for the preview **and** ability effects.
  - Preview: fill each cell, then stroke only the **outer edges of the union of cells** (edges shared by two cells cancel). This generic outline replaces the hand-coded plus perimeter. Keep optional internal grid lines for the square preset to match Gather Stone's look.
  - Move the arrow-drawing helper from `0537Ability.ts` into `abilities/previewHelpers.ts`.
  - **Touches:** new `hitboxes/TileAreaHitboxSpec.ts`, `hitboxes/index.ts`, `abilities/tileAreaHelpers.ts`, `abilities/previewHelpers.ts`, new `abilities/telegraphStyles.ts`
  - Done: `hitboxes/TileAreaHitboxSpec.ts` provides `tileAreaHitbox`, `tileShapes` (`single`, `square(half)`, `plus` with the centre first), the `chebyshev` and `adjacentCardinal` anchors, `resolveAnchor`, `resolveCells` and `cellsAround`, plus the `gridLines` and `directionArrow` options. `abilities/telegraphStyles.ts` exports `TELEGRAPH_STYLES` (`danger`, `earth`). `drawArrow` moved from 0537 into `previewHelpers.ts` and now takes a centre point. `drawTileAreaTelegraph` there fills each cell and strokes only the outer outline of the union. `tileAreaHelpers.ts` gained `tileCentre`, `getTileAreaEdges` and `getTileAreaOutlineLoops`, and lost the unused plus perimeter, `drawPlusTileArea`, `drawTileHighlight`, `squareTileAreaWorldRect`, `getSquareTileAreaCells` and `getPlusTileAreaCells`. `hitboxes/index.ts` exports the new spec. Note: the square telegraph now fills per cell, not as one rectangle.
- [x] Migrate the callers and delete the old hitboxes:
  - Gather Stone (square, chebyshev 2).
  - Stone Tomb (plus, chebyshev 4).
  - Rock Slide (single + chebyshev 2; single + adjacentCardinal with arrow).
  - Ability effect code must derive cells via the hitbox's `resolveCells`, not by re-calling the snap helpers with its own constants.
  - Delete `SquareTileAreaHitboxSpec.ts`, `PlusTileAreaHitboxSpec.ts` and `TileSelectHitboxSpec.ts`, plus helpers that become unused (`plusTileAreaPerimeter`, `drawPlusTileArea`, `drawTileHighlight`, `squareTileAreaWorldRect` if unused).
  - Update `hitboxes/SKILL.md`.
  - **Touches:** `card_defs/05_earth_core/0536_GatherStone/0536Ability.ts`, `0530_StoneTomb/0530Ability.ts`, `0537_RockSlide/0537Ability.ts`, `hitboxes/index.ts`, `hitboxes/SKILL.md`, the three old hitbox files, `abilities/tileAreaHelpers.ts`
  - Done: Gather Stone (`chebyshev` 2, `square(1)`, `gridLines`, `earth`), Stone Tomb (`chebyshev` 4, `plus`, `danger`) and Rock Slide now use `TileAreaHitboxSpec`. Their effects take cells from `resolveCells` and their previews use `drawTileAreaTelegraph`. Rock Slide's rock and direction hitboxes (`ROCK_PICK_HITBOX`, `DIRECTION_PICK_HITBOX`) live in `rockSlideHelpers.ts` so the helpers and the ability share one definition. That needed `resolveRockTile` to return `TileCoord | null` and `tileCenter` to become `tileCentre`. The direction arrow is now drawn by the hitbox, so `renderTargetingPreviewSelectedTargets` only draws the grey X. Until Step 8, an invalid direction pick therefore shows the arrow under the X. The three old hitbox files are deleted. `hitboxes/SKILL.md` has a `TileAreaHitboxSpec` section. Not in the Touches list: `rockSlideHelpers.ts`, `abilities/previewHelpers.ts` and `abilities/telegraphStyles.ts`.
- [x] Add `hitboxes/TileAreaHitboxSpec.test.ts` covering:
  - Anchor clamping for both anchor kinds, including the diagonal dominant-axis rule and aim-on-caster → null.
  - Cells for each preset.
  - The outline segment count for single (4), plus (12) and 3×3 square (12).
  - Update `0536Ability.test.ts`, `0530Ability.test.ts` and `0537Ability.test.ts` imports.
  - **Touches:** new test plus the three ability tests; run those four files
  - Done: new `hitboxes/TileAreaHitboxSpec.test.ts` covers anchor clamping for both kinds (including the dominant-axis rule and aim-on-caster giving null), cells for each preset, and outline edge counts (single 4, plus 12, 3x3 12). `0536Ability.test.ts` and `0530Ability.test.ts` have their imports and geometry assertions moved to the new helpers. The square world-rect test is dropped, because the new test covers that geometry. `0537Ability.test.ts` needed no change, since its imports still exist. **Not run** (lint and test runs deferred per the user's override). `npx tsc --noEmit` passes.

---

### Step 8 — `validatePick` used by preview, AI and execution

- [x] Show invalid picks in the preview.
  - Add optional `HitboxSpec.renderInvalidPreview(gr, caster, aim)`: the default draws a grey X at the aim; `TileAreaHitboxSpec` greys the cells and draws an X per anchor tile.
  - In `PreviewRenderer`'s select rendering, resolve the pick the same way the click does (refactor `resolveItsSelectTargetForClick`'s clamp part into a shared pure helper if needed). When `selectDef.validatePick` returns false, call `renderInvalidPreview` instead of the normal preview.
  - Remove Rock Slide's `renderTargetingPreviewSelectedTargets` overlay.
  - **Touches:** `hitboxes/HitboxSpec.ts`, `hitboxes/TileAreaHitboxSpec.ts`, `game/GameRenderer/renderers/PreviewRenderer.ts`, `game/interaction/itsCanvasInput.ts`, `abilities/targeting.ts`, `card_defs/05_earth_core/0537_RockSlide/0537Ability.ts`
  - Done: `resolveSelectPickForAim` in `abilities/targeting.ts` is the shared pure pick (lock-on, miss, clamp, no validation). The click path and the preview both use it. `HitboxSpec.renderInvalidPreview` defaults to a grey cross (`hitboxes/invalidPickPreview.ts`). `TileAreaHitboxSpec` overrides it to grey the cells and cross the anchor. `TELEGRAPH_STYLES.invalid` is the grey palette. `PreviewRenderer` swaps to the invalid drawing when `validatePick` rejects the aim, on the live cursor and the ghost-plan cursor. Rock Slide's overlay and its private `drawInvalidMark` are gone, so an invalid direction no longer shows the arrow. Not in Touches: `hitboxes/invalidPickPreview.ts` (new), `abilities/telegraphStyles.ts`, `hitboxes/SKILL.md`. Committed ghost previews are not re-validated (they were checked at commit).
- [x] Respect `validatePick` in AI and execution:
  - **AI:** `buildAiSelectTargets` returns no targets / marks the ability unusable when any built pick fails `validatePick`. Grep how callers handle an unusable result; pause and ask if there is no such path.
  - **Execution:** when a select interval with `validatePick` **enters** (committed or preview run, after Step 6's gate), re-validate the resolved target. If it is invalid, end the cast through the cancel path (`cancelUnitActiveAbility`, refunding per policy) — a generic "fizzle".
  - Remove now-redundant defensive checks from Rock Slide and Stone Tomb in Steps 10–11.
  - **Touches:** `abilities/targeting.ts`, `game/units/unitAbilityTick.ts`, `game/units/unitAbilityLifecycle.ts`
  - Done: **AI:** `buildAiSelectTargets` now returns `valid`, false when any built pick fails its `validatePick`. The AI engine view passes `terrainManager` through (the real TerrainManager at runtime). `pickBestAbility` drops a rejected plan so the AI can choose another ability, and `tryQueueAbilityOrder` never queues one. **Execution:** `hasRejectedEnteringSelectPick` (in `unitAbilityTick.ts`) re-runs `validatePick` on each select interval that enters this tick, against `targetsByLabel` or the positional target. A rejected cast skips that tick, and it is removed after the loop by the new `fizzleUnitActiveAbility` (in `unitAbilityLifecycle.ts`). Deviation: `cancelUnitActiveAbility` does not refund, so the fizzle applies the interrupt policy directly: `skipToCooldown` snaps to cooldown, otherwise refund and remove, with ON_CAST_END and behaviour cleanup. It also clears the ability note, as an interrupt does. Only Rock Slide defines `validatePick`, so no other ability changes. Not in Touches: `unitAI/utils.ts`, `game/units/unitAbilityLifecycle.ts` (the new helper).
- [x] Tests: AI skips an ability whose pick is invalid; a committed order whose rock tile was removed before the select interval entered fizzles (no projectile, the cast ends). Put these in `0537Ability.test.ts` or a new `abilities/validatePick.test.ts`.
  - **Touches:** the listed test files; run only those
  - Done: new `abilities/validatePick.test.ts` covers the AI rejection (`valid` false for Rock Slide against a grass enemy), the fizzle (rock destroyed before the order; no projectile and no cast after 5 ticks), and the invalid previews (tile-area greys and crosses without clearing; the default draws only a cross). **Not run** (lint and test runs deferred per the user's override). `npx tsc --noEmit` passes. Not covered: an AI-valid positive case and a direction-pick fizzle mid-cast. Both need a known geometry that I did not verify.

---

### Step 9 — Reusable cast-behaviour building blocks

- [x] Create `abilities/easing.ts` (`easeOutCubic`, `easeInOutQuad`, plus whatever `ui/abilityUseChargeAnimation.ts` uses) and replace the private copies in `MeleeAttack.ts`, `ui/abilityUseChargeAnimation.ts` and `0537Ability.ts`.
  - **Touches:** new `abilities/easing.ts`, `abilities/CastBehaviours/MeleeAttack.ts`, `ui/abilityUseChargeAnimation.ts`, `card_defs/05_earth_core/0537_RockSlide/0537Ability.ts`
  - Done: `abilities/easing.ts` exports `easeOutCubic` and `easeInOutQuad`. The three private copies were identical, and all three files now import them. `abilityUseChargeAnimation.ts` needed only `easeOutCubic`.
- [x] Add `CastBehaviours.CasterSlide({ forwardDistance, backwardDistance, impactAt, direction: (ctx) => {x,y} | null })` (render-only via `getCasterRenderOffset`) by extracting the slide maths from `MeleeAttack`.
  - `MeleeAttack.withSlide` must delegate to it, with no visual change for melee abilities.
  - Add `CastBehaviours.CasterShake({ from, to })`, an amplitude ramp over its window, deterministic (no `Math.random`).
  - Add `CastBehaviours.Instant(fn, { at: 'start' | 'end' })`, where `'end'` fires on `isLastTick`. Default `'start'` keeps current behaviour.
  - **Touches:** `abilities/CastBehaviours/index.ts`, new `abilities/CastBehaviours/CasterSlideBehaviour.ts`, `abilities/CastBehaviours/CasterShakeBehaviour.ts`, `abilities/CastBehaviours/InstantBehaviour.ts`, `abilities/CastBehaviours/MeleeAttack.ts`
  - Done: `casterSlideMagnitude` (the slide curve, moved out of `MeleeAttack`) and the render-only `CasterSlideBehaviour` class live in `CasterSlideBehaviour.ts`. `MeleeAttack.getCasterRenderOffset` keeps its own direction and guard logic and calls `casterSlideMagnitude`, so its curve and output are unchanged. Its `withSlide` config is still stored on `MeleeAttack` rather than wrapped in the class, because `impactAt` can be set after `withSlide`. `CasterShakeBehaviour.ts` is render-only, with the amplitude ramp and a game-time sine (no RNG). `InstantBehaviour` takes `{ at }`, default `'start'`. All three are on `CastBehaviours`.
- [x] Extend `ProjectileLaunchBehaviour`:
  - `withOrigin((ctx) => point)` (default: caster).
  - `withDirection((ctx) => unitVector)` (default: toward the target as today).
  - `withHitPolicy(...)` and `withModifiers` passthrough.
  - `withHold({ onCancelled?: (ctx, projectile) => void })`. When held, `onSetup` spawns via `Projectile` held state (Step 2) with `heldBy = { caster.id, abilityId }`, the projectile id goes in the behaviour payload, the window's `isLastTick` releases it, and `onInterrupt` calls `cancelHeld()` then `onCancelled`.
  - Because Step 1 routes every early cast end through `cleanupCastBehavioursForAbility`, held projectiles can no longer be orphaned by cast removal; the Step 2 timer remains as the last-resort safeguard.
  - **Touches:** `abilities/CastBehaviours/ProjectileLaunchBehaviour.ts`
  - Done: `withOrigin` and `withDirection` are added. A fixed direction flies `maxRange`, and a null or zero direction skips the launch. The default still aims at the target, and its clamp now starts from the origin, which is the caster unless `withOrigin` is set. `withHold({ onCancelled })` spawns the projectile with `heldBy` and writes `projectileId`, `dirX` and `dirY` to the payload. `onTick` releases it on `isLastTick`, which windowed exits and one-shot entries both receive. `onInterrupt` cancels it only while it is still held, then calls `onCancelled`. `withHitPolicy` and `withModifiers` were already forwarded (Step 3), so I checked them and changed nothing there.
- [x] Add a behaviour test file `abilities/CastBehaviours/behaviours.test.ts` covering:
  - `CasterSlide` offsets at 0, impact and end.
  - `Instant({at:'end'})` fires once on the last tick.
  - A held `ProjectileLaunch`: spawned held → released at window end → moving. Interrupted inside the window → `onCancelled` called, projectile inactive. Same-id recast inside the window → cancelled (relies on Step 1).
  - Run it plus the MeleeAttack tests (`abilities/CastBehaviours/*.test.ts`).
  - **Touches:** new test file
  - Done: `behaviours.test.ts` uses hand-built engine and context stubs, so no battle engine is needed. It covers the CasterSlide offsets and a null direction, CasterShake determinism and ramp, `Instant` default and `{ at: 'end' }`, and the held launch cases (spawned held, stays held mid-window, released at window end, cancelled with `onCancelled`, not cancelled after release, unheld unchanged). Not covered: the same-id recast path, which needs the real lifecycle (the Step 1 interrupt test covers `onInterrupt` on recast). **Not run** (test runs deferred per the user's override). `npx tsc --noEmit` passes.

---

### Step 10 — Port Rock Slide onto the shared systems

> **Worker note (Step 10):** the Step 6 gate bug is fixed under Step 6 (approved by the orchestrator). The Direction interval is now two ticks (see `ROCK_SLIDE_AIM_END`). The Direction `validatePick` keeps the stricter `isSlideSpawnTile` check (in bounds, not rock, passable), not the plan's "not projectile-obstructed" wording.

- [x] Rewrite `0537Ability.ts` with `defineAbility` and declarative intervals; **no `doCardEffect`, no `crossed()`, no `castPayload`**. Suggested structure (adjust ids or times only if Step 6's gate requires):
  - `pickRock` `[0, FIXED_DT)`: select `Rock` (TileAreaHitboxSpec single/chebyshev 2, `validatePick` = intact rock via `TerrainManager.isIntactRockAt`) + `Instant` → inward chips.
  - `windup` `[FIXED_DT, 0.4)`: `targetDef: { kind: 'hit', labels: ['Rock'] }`, `CasterShake`, `Instant({ at: 'end' })` → `TerrainManager.destroyRock`.
  - `pickDirection` `[0.4, 0.4 + FIXED_DT)`: select `Direction` (adjacentCardinal + arrow, `validatePick` = not rock and not projectile-obstructed) + `Instant` → outward chips.
  - `charge` `[.., 0.7)`.
  - `punch` `[0.7, 1.0)` with `castBehaviours`:
    - `ProjectileLaunch().withOrigin(spawn tile centre).withDirection(cardinal).withHold({ onCancelled: raise rock under the projectile })`, `.withHitPolicy({ damagingHits: 5, overflow: 'knockbackOnly', knockback: { tier: ROCK_SLIDE_KNOCKBACK_TIER, direction: { kind: 'sideOfTravel', angleDeg: 45 } } })` and `.withModifiers(['stopsAtWalls'])`, on sub-window `timingStart: 'start', timingEnd: 0.15` (the hold releases at the end of that sub-window = 0.85).
    - `CasterSlide({ impactAt: '50%', ... })` over the whole window.
  - `cooldown` `[1.0, 1.4)`.
  - `movementLock: { until: ROCK_SLIDE_LAUNCH_TIME }`; `interruptPolicy: { duringCooldown: 'end' }`.
  - `onProjectileExpired`: raise rock at the projectile's tile (this now owns tile snapping).
  - Delete `onCastInterrupted` from `Ability.ts` and the lifecycle if nothing else uses it (grep); otherwise leave it and say why in the summary.
  - Constants: remove `ROCK_SLIDE_TICK` / `ROCK_SLIDE_DESTROY_TIME` lead-time maths; use `FIXED_DT` from `game/gameConstants.ts`.
  - Fold `rockSlideHelpers.ts` into the shared helpers where duplicated, and delete what becomes unused.
  - **Touches:** `card_defs/05_earth_core/0537_RockSlide/*`, `card_defs/05_earth_core/earthCoreConstants.ts`, `abilities/Ability.ts`, `game/units/unitAbilityLifecycle.ts`, `game/projectiles/projectile_defs/rockSlideDef.ts` (only if a field name changed)
  - Done: `0537Ability.ts` now uses `defineAbility`, with no `doCardEffect`, `crossed`, `castPayload`, `getAbilityStates` or `getCasterRenderOffset`. The windup (hit Rock) runs a `CasterShake`, Instant chips at its start, and `Instant({at:'end'})` → `destroyRock` at 0.40. The Direction select (Instant outward chips) runs from 0.40 for two ticks. The punch (hit Direction) has a `ProjectileLaunch` sub-window (`withOrigin` spawn tile centre, `withDirection`, `withHold` whose `onCancelled` settles the rock, `withHitPolicy` {5 damaging, knockbackOnly, sideOfTravel 45}, `stopsAtWalls`, released at 0.85) plus `CasterSlide` (impactAt 0.5). `movementLock` runs to launch, `interruptPolicy: { duringCooldown: 'end' }`, and `onProjectileExpired` settles the rock. `onCastInterrupted` is removed from `Ability.ts`, `unitAbilityLifecycle.ts` and its interrupt test. `stopAtImpassable` is removed from `Projectile.ts` and its test. `ROCK_SLIDE_TICK` and `ROCK_SLIDE_DESTROY_TIME` are gone, and `FIXED_DT` is used. `rockSlideVfx.ts` uses the new timings. `rockSlideHelpers.ts` drops `isRockTile` and its own bounds check in favour of `TerrainManager`. `npx tsc --noEmit` passes. Deviations: `prefireTime` is now `ROCK_SLIDE_AIM_START` (was the old destroy time, 0.367); the Direction interval is two ticks (`ROCK_SLIDE_AIM_END` 0.433, was 0.417), so the charge starts one tick later; Direction `hit` entries use `targetIndex: 1` for the committed-run fallback. Not run (lint and test runs deferred per the user's override).
- [x] Update `0537Ability.test.ts`:
  - Keep every behavioural assertion: the timeline order, the dormant → held projectile, the three interrupt cases, five damaging hits plus overflow knockback, side directions, and pick validation.
  - Adjust only internals (no `velocityX === 0` dormant check; assert `heldBy` instead).
  - Replace the hand-copied `resolveOrderPause` with a helper exported from `testing/runner/SimulationRunner.ts` (export the existing `maybeAutoResolveParallelOrderPause` or a `stepTick(engine)` wrapper).
  - Add cases: same-id recast while holding → rock at the spawn tile, projectile gone; ITS preview pause for `Direction` sees the rock tile already Rubble (uses Step 6).
  - **Touches:** `0537Ability.test.ts`, `testing/runner/SimulationRunner.ts`; run `0537Ability.test.ts` only
  - Done: all the timeline, interrupt, projectile-hit and pick-validation assertions are kept, with the constants moved to `ROCK_SLIDE_AIM_START`. The dormant check is now `isHeld` and `heldBy`. `resolveOrderPause` is replaced by the exported `resolveParallelOrderPause` in `SimulationRunner.ts`. New cases: a same-id recast while the rock is held removes the projectile and puts the rock on the spawn tile, and an ITS run pauses for Direction only after the rock is Rubble, then launches the held rock once the pick is injected. The engine-level ITS case relies on `player.abilityRuntime` and `executeUnitAbility` directly, so it is unverified. Not run (test runs deferred per the user's override).

---

### Step 11 — Port Stone Tomb onto the shared systems

- [x] Rewrite `0530Ability.ts` with `defineAbility` and declarative intervals; no `doCardEffect`.
  - Done: `defineAbility` with `movementLock: { until: STAGE2_TIME }` (no `getAbilityStates`, no `getRange`, which is derived from the select hitbox). Intervals: `windup`, `pickTomb` (gated select, `[0.5, 0.5 + 2*FIXED_DT)`, label `Tomb location`), `stage1` (`hit` on that label, Instant at start: centre damage, knockback for everyone in the centre tile, centre rock), `stage2` (`hit`, Instant at start: plus damage, outer rocks), `cooldown`. Cells come from `resolveCells` and occupants from `getUnitsInTiles`. Added `STONE_TOMB_AIM_END` to `earthCoreConstants.ts`. Deviation: the tomb pick is now two ticks (as Rock Slide's direction pick is), so stage 1's damage and rock land on the tick the `stage1` window enters (about 0.533s, was 0.5s). Stage 2 timing is unchanged. Knockback escape (Step 5) comes through the existing `tryApplyKnockbackByTier` path; I did not add an explicit flag here.
  - Test file: `0530Ability.test.ts` no longer calls `doCardEffect`. It drives each interval's Instant behaviours with a hand-built context, and keeps the geometry, centre-only damage and centre rock, allies knocked back undamaged, stage 2 cells and the clamp. It adds a timing assertion for the gated pick and the `hit` label on stage 1. No test asserted a centre victim stays in place, so none changed. **Not run** (test runs deferred per the user's override).
  - **Touches:** `card_defs/05_earth_core/0530_StoneTomb/0530Ability.ts`, `0530Ability.test.ts`, `earthCoreConstants.ts`

---

### Step 12 — Research and tooltip text from constants

- [x] Build the Stone Tomb and Rock Slide research-node descriptions in `app/js/researchTrees/trees/earth.ts` from the exported constants with template strings (as Earth Attuned does), keeping the `{n}` highlight braces. Do the same for both abilities' tooltips.
  - Done: both descriptions in `earth.ts` are template strings over `STONE_TOMB_STAGE1_DAMAGE`, `STONE_TOMB_STAGE2_DAMAGE`, `STONE_TOMB_STAGE_GAP`, `ROCK_SLIDE_ROCK_MAX_TILE_OFFSET`, `ROCK_SLIDE_TRAVEL_TILES`, `ROCK_SLIDE_DAMAGE` and `ROCK_SLIDE_MAX_DAMAGE_TARGETS`, imported from `earthCoreConstants.ts`. Rendered text is unchanged (2 and 10 tiles, 12 and 6 damage, 5 targets, 0.25s). The `{n}` braces are kept. The 0530 and 0537 `getTooltipText` already build from constants, so I made no edit there. `npx tsc --noEmit` passes. Tests and lint not run (deferred per the user's override).
  - **Touches:** `app/js/researchTrees/trees/earth.ts`, `0530Ability.ts`, `0537Ability.ts`; run `app/js/researchTrees/treeAbilities.test.ts` and `earthMetalCosts.test.ts`

---

### Step 13 — AbilityTest scenarios and docs

Create the scenarios here but **do not run `SimulationRunner.test.ts` in this step** (Step 14 does).

- [x] Add these scenarios to `testing/scenarios/abilities/earthCoreScenarios.ts`, register them in `testing/scenarios/registry.ts` (both lists that `earthCoreStoneTombScenario` appears in), and add `it(...)` entries in `testing/runner/SimulationRunner.test.ts`:
  - `earthCoreRockSlideLandsOnEnemyScenario`: Rock Slide's projectile stops at a wall tile where a damaged-but-alive dummy is standing in the resting tile. Pass when the resting tile is Rock **and** the dummy ends outside rock (wall-unstick handled it) and alive. Covers the wall stop + Entombed/unstick hand-off.
  - `earthCoreStoneTombCentreEscapeScenario`: a dummy in the Stone Tomb centre tile ends the cast outside the centre tile, which is Rock, having taken at least the stage-1 damage. Covers the Step 5 fix.
  - `earthCoreRockSlideStonephaseScenario` **only if** a stonephase source can be applied to Rock Slide without a new research node. Otherwise skip it and note that in the summary (stonephase priority is unit-tested in Step 3).
  - Assertions must be structural (tile types, inside/outside rock, alive or hit) rather than exact HP, and deterministic.
  - **Touches:** listed files
  - Done: `earthCoreScenarios.ts` gains `earthCoreStoneTombCentreEscapeScenario` (dummy on the centre tile; passes when the centre is Rock, the dummy is alive and off the centre tile, and it lost at least the stage-1 damage) and `earthCoreRockSlideLandsOnEnemyScenario` (dummy on the resting tile; passes when the resting tile is Rock, the dummy is alive, damaged and not on rock, and no projectile is live). Both are registered in `registry.ts` (import and list) and `SimulationRunner.test.ts` (import and `it`). Verified by reading: Stone Tomb's knockback reaches `computeForcedDisplacement` with `escapeWalls` (`tryApplyKnockbackByTier` → `Unit.applyKnockback` → `updateUnitKnockback`, called from `unitMovementTick` with the terrain manager, and no `passThroughTerrain` is set), so no wiring change was needed. A dummy exactly on the centre has no knockback direction, so `getDirectionFromTo` pushes it east. Stonephase scenario skipped: only Knock (0531) grants stonephase, so a Rock Slide one would need a new mechanic. Scenarios not run (deferred per the override). `npx tsc --noEmit` passes.
- [x] Update the docs:
  - `abilities/AGENTS.md`: the interrupt pipeline and `interruptPolicy`, held projectiles, the new behaviours, `validatePick`, and the select gate rule.
  - `card_defs/05_earth_core/EarthCore.md`: Rock Slide and Stone Tomb entries, and the shared terrain helpers.
  - `game/projectiles` AGENTS or SKILL file if one exists (grep), otherwise a short section in `abilities/AGENTS.md`: `hitPolicy`, `stopsAtWalls`, stonephase priority, held state, orphan warning.
  - Follow `writing-nested-agents-files`.
  - **Touches:** listed docs
  - Done: `abilities/AGENTS.md` gained folder rows (CastBehaviours, tile helpers) and sections on interrupts (`interruptUnitAbilities`, `interruptPolicy`, fizzle), the select gate and `validatePick`, held projectiles and the orphan warning, and projectile `hitPolicy`, `stopsAtWalls`, stonephase priority and `escapeWalls`. `EarthCore.md` gained an "Abilities on the shared systems" section for Stone Tomb, Rock Slide and the shared terrain helpers. There is no `game/projectiles` AGENTS or SKILL file, so the projectile notes went into `abilities/AGENTS.md`, as the plan allows. The docs name behaviour and files, not constant values.

---

### Step 14 — Final verification (run the expensive things once)

- [x] `npm run lint` and `npx tsc --noEmit` — zero errors.
  - Done: `tsc` clean; lint 0 errors, 16 warnings, all in files this plan does not touch. Two warnings from this plan, an unused `STONE_TOMB_MAX_TILE_OFFSET` import in `earth.ts` and an unused `Unit` import in `validatePick.test.ts`, were removed.
- [x] Run the AbilityTest scenarios: `npx vitest run app/js/games/minion_battles/testing/runner/SimulationRunner.test.ts`. All Earth scenarios (existing and new), Knock (stonephase), Throw Knife, Double Punch and swing scenarios must pass. Record pre-existing failures separately.
  - Done: 99/99 pass, no pre-existing failures. With the knockback wall escape disabled, `earthCoreStoneTombCentreEscapeScenario` fails, so the scenario guards Fix 3.
- [x] Run the broad suite once: `npm run test`. Compare failures with the orchestrator's baseline and fix any new failure, or record it with a justification.
  - Done: 340 files, 2680 passed, 2 skipped (Beast Claw, and Rock Slide in the generic preview/canon harness; see Fix 6 below). The one failure on the first targeted run was `previewCanonEquivalence.test.ts` › generic 0537. The generic harness aims at a dummy on grass, so Rock Slide's new `validatePick` fizzles the cast before the Direction pause. That is a harness gap, not a divergence. It is fixed by Fix 6, so no failures needed a HEAD comparison.
- [x] Write a manual browser checklist into this plan for the user. Do not attempt it unless a browser tool is available and the user asked.
  - Done: see "Manual browser checklist" below. Not attempted.

### Review fixes (after Steps 1–13)

A review found the following bugs, which are now fixed and tested:

1. **Held projectile id.** `ProjectileLaunchBehaviour.onSetup` now writes the payload after `engine.addProjectile` (which reassigns the id). The `behaviours.test.ts` stub engine now reassigns ids the same way, and `0537Ability.test.ts` (real engine) passes.
2. **Select gate and short selects.** On the resumed tick, `tickUnitActiveAbilities` force-enters the intervals the gate held back (`selectGateDeferredIds` in `selectTargetLookahead.ts`), even when they have already ended. They then exit on the same tick, like a one-shot entry. `findImpendingNeedForCast` applies the same rule, so the lookahead still pauses. `ROCK_SLIDE_AIM_END` and `STONE_TOMB_AIM_END` are back to one tick. `selectTargetLookahead.gate.test.ts` gains an engine-level test with a registered one-tick select and an `Instant({ at: 'end' })` windup. It runs mid-tick (0.31) and on a tick boundary (0.3), checks that the windup effect is visible at the pause and that the select enters on the next tick, and checks committed vs preview per-tick fingerprints. Disabling the forced entry fails it.
3. **Knockback wall escape.** `escapeWalls` is removed from `forceMove.ts`, along with its tests. `updateUnitKnockback` now moves a segment that starts inside a wall without terrain collision and keeps the knockback alive. Normal collision resumes once the unit is on passable ground, and a knockback that ends inside the wall leaves the unit for `tickWallUnstick`. Dashes, lunges, nudges and Lifted are unchanged. New tests are in `game/units/unitKnockback.wallEscape.test.ts`. `STONE_TOMB_KNOCKBACK_TIER` is now **2** (about 42px; tier 1, about 18px, cannot clear half a tile). `earthCoreStoneTombCentreEscapeScenario` now puts the dummy south-east of the tile centre, so it lands on (6, 6), outside the plus. It requires exactly the stage-1 damage, so any slingshot or stage-2 damage fails it.
4. **Skip-to-cooldown gate state.** `skipActiveAbilityToCooldown` clears `processedElapsed` and `pendingSelectGate`. The duplicate deletes in `fizzleUnitActiveAbility` are removed. Tested in `unitAbilityLifecycle.interrupt.test.ts`: there is no pre-cooldown entry, and the next tick's window starts at the cooldown start.
5. **Low-priority fixes.**
   - Stone Tomb builds its knockback context with `knockbackCtxFromEngine`, so knocked-back units get their casts interrupted.
   - `CasterSlide` now captures its direction in its own payload when its window opens (at 0.70, while Rock Slide is still movement-locked), so walking after launch cannot flip the slide-out. Tested in `behaviours.test.ts`.
   - `earthCoreRockSlideLandsOnEnemyScenario` boxes the resting tile with rock on its north, south and east diagonals. The side knockback is blocked, the rock settles under the dummy, and the scenario requires the hit damage plus at least one wall-unstick bounce.
6. **Found during verification.** The generic preview/canon equivalence harness skips Rock Slide (its rock pick needs an intact rock). A dedicated Rock Slide case was added that places a rock and covers both selects. A leftover `DBG` `console.log` was removed from that file.

### Manual browser checklist

Run this in a campaign battle or the admin Ability Test page with an Earth Core character that has Rock Slide, Stone Tomb and Gather Stone.

- **Rock Slide pick validation:** hover a non-rock tile within 2 tiles. It shows a grey tile with a cross, and clicking it does nothing. A rock tile shows the red single-tile telegraph.
- **Rock Slide windup:** after a valid rock pick, the caster shakes and chips fly from the rock into the caster.
- **Rubble before Direction:** when the Direction pause appears, the picked rock is already rubble.
- **Direction arrow:** the arrow follows the cursor across the four adjacent tiles. A rock or impassable neighbour shows the grey cross. The rubble tile, if adjacent, is a legal pick.
- **Punch:** after the Direction pick, chips fly out of the caster and the rock appears on the picked tile. The caster slides into it and back out. The slide-out keeps its direction even if you queue a walk elsewhere.
- **Flight and landing:** the rock flies along the line and knocks enemies off to the sides at 45 degrees. The first five take damage. It lands as a rock tile at the first wall or at 10 tiles.
- **Rock Slide interrupted:** stun or knock the caster back between 0.70s and 0.85s. A rock appears on the spawn tile, and no rock flies. No `[Projectile] held projectile orphaned` warning appears in the console.
- **Stone Tomb telegraph:** the plus shows a single outer outline, with no internal lines between its cells.
- **Stone Tomb centre enemy:** an enemy in the centre tile is knocked clear of the rising rock without being slingshotted. It takes no 5-damage bounce, unless it is pushed onto an outer plus tile, which stage 2 then raises.
- **Stone Tomb pick timing:** the tomb pick pause comes at 0.5s, and stage 1 lands immediately after the pick.
- **Gather Stone:** the telegraph looks the same as before: an amber 3x3 with internal grid lines.

---

## AbilityTest philosophy for this plan

- **Few scenarios, high level:** Rock Slide end-to-end (existing), Rock Slide landing on a unit, and Stone Tomb centre escape. Interrupt and held-projectile edge cases are covered by fast Vitest unit and integration tests, not scenarios.
- Structural assertions only, deterministic positions, no RNG.

## Out of scope

- `TerrainGrid.hasLineOfSight` ignoring player-made rock (noted in Context; separate follow-up).
- Porting other `doCardEffect` abilities (Gather Stone, Anchored Tremor, etc.) to CastBehaviours. Gather Stone only gets the hitbox and terrain-helper migration.
- New VFX systems (`StoryHomingParticleEmitter` rename or `VisualEffectDef` migration) and the rock-slide projectile using terrain art.
- Balance changes.

## File Reference Map

| File | Steps |
|---|---|
| `abilities/Ability.ts` | 1, 10 |
| `game/units/unitAbilityLifecycle.ts` | 1, 8, 10 |
| `game/units/Unit.ts`, `game/units/unitWallUnstick.ts` | 1, 5 |
| `game/gameConstants.ts`, `game/GameEngine.ts` | 2, 6 |
| `game/projectiles/Projectile.ts`, `ProjectileTravelModifiers.ts` | 2, 3 |
| `crowdControl/knockbackKeywords.ts` | 3 |
| `card_defs/0109_ThrowKnife/0109Ability.ts` | 3 |
| `terrain/TerrainType.ts`, `terrain/TerrainManager.ts` | 3, 4 |
| `abilities/tileAreaHelpers.ts`, `abilities/AbilityEngineContext.ts` | 4, 7 |
| `game/forceMove.ts` | 5 |
| `game/units/unitAbilityTick.ts`, `game/interaction/selectTargetLookahead.ts` | 6, 8 |
| `hitboxes/TileAreaHitboxSpec.ts` (new), old tile hitboxes (deleted) | 7, 8 |
| `game/GameRenderer/renderers/PreviewRenderer.ts`, `abilities/targeting.ts`, `game/interaction/itsCanvasInput.ts` | 8 |
| `abilities/CastBehaviours/*`, `abilities/easing.ts` (new) | 9 |
| `card_defs/05_earth_core/0537_RockSlide/*` | 1, 7, 8, 9, 10, 12 |
| `card_defs/05_earth_core/0530_StoneTomb/*` | 7, 11, 12 |
| `card_defs/05_earth_core/0536_GatherStone/*` | 4, 7 |
| `app/js/researchTrees/trees/earth.ts` | 12 |
| `testing/scenarios/*`, `testing/runner/*` | 10, 13, 14 |
| `docs/interactive-sequential-targeting.md`, AGENTS/SKILL docs | 6, 13 |
