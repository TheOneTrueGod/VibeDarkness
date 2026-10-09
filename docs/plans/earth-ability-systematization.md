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
| Tile hitboxes | `hitboxes/SquareTileAreaHitboxSpec.ts`, `hitboxes/PlusTileAreaHitboxSpec.ts`, `hitboxes/TileSelectHitboxSpec.ts`; helpers in `abilities/tileAreaHelpers.ts` |
| `validatePick` used by click handling only | `abilities/timingTargetDef.ts`, `game/interaction/itsCanvasInput.ts`, `game/interaction/tools/AbilityTargetingTool.ts` |
| Select preview rendering | `game/GameRenderer/renderers/PreviewRenderer.ts` `renderSelectTargetDef` (~L95) and the interactive branch (~L645) |
| AI select targets | `abilities/targeting.ts` `buildAiSelectTargets` |
| `CellOccupancyManager` only tracks units with `maxPerTile` from a snapshot taken once per tick — **not** suitable for "who is standing in these tiles" | `game/managers/CellOccupancyManager.ts` |

---

## Checklist

### Step 1 — One interrupt path with cleanup and an interrupt policy

Every place that ends a cast early must run the same pipeline: `ON_CAST_END`, `cleanupCastBehavioursForAbility` (which fires behaviour `onInterrupt`), and the ability's interrupt policy. This step is the foundation for held projectiles.

- [ ] Replace `skipToCooldownOnInterrupt` and `interruptEndsCooldown` on `AbilityStatic` with a single `interruptPolicy?: { beforeCooldown?: 'cancel' | 'skipToCooldown'; duringCooldown?: 'ignore' | 'end' }`.
  - The defaults `{ beforeCooldown: 'cancel', duringCooldown: 'ignore' }` reproduce today's default behaviour.
  - Migrate every existing `skipToCooldownOnInterrupt: true` user (grep) to `interruptPolicy: { beforeCooldown: 'skipToCooldown' }`.
  - Migrate Rock Slide's `interruptEndsCooldown: true` to `{ duringCooldown: 'end' }`.
  - Keep `onCastInterrupted` for now; Step 10 removes it.
  - **Touches:** `abilities/Ability.ts`, `game/units/unitAbilityLifecycle.ts`, every file returned by grepping `skipToCooldownOnInterrupt`, `card_defs/05_earth_core/0537_RockSlide/0537Ability.ts`
- [ ] Collapse `interruptAndRefundUnitAbilities` and `interruptAllUnitAbilities` into one exported `interruptUnitAbilities(unit, engine: EngineContext)` that applies the policy.
  - Per cast, it calls `onCastInterrupted`, fires `ON_CAST_END`, runs `cleanupCastBehavioursForAbility`, refunds (when cancelling) and clears the ability note.
  - Point `Unit.interruptAllAbilities` and `Unit.interruptAndRefundAbilities` at it. Keep both method names as thin aliases unless every caller is trivially updated. Widen `interruptAllAbilities`'s engine parameter to `EngineContext` and fix callers.
  - **Touches:** `game/units/unitAbilityLifecycle.ts`, `game/units/Unit.ts`, `abilities/events/AbilityEventRuntime.ts`, `card_defs/0110_ShiningBlock/0110Ability.ts`, `game/GameEngine.ts` (`interruptUnitAndRefundAbilities`)
- [ ] Route the controlled-slingshot cast removal in `tickWallUnstick` through `interruptUnitAbilities`. Its "keep Cooldown/CoopCooldown casts" rule must equal the default `duringCooldown: 'ignore'`; if it differs, pause and ask.
  - Make `executeUnitAbility`'s replace-existing branch run `cleanupCastBehavioursForAbility` on the old cast after firing its `ON_CAST_END`.
  - **Touches:** `game/units/unitWallUnstick.ts`, `game/units/unitAbilityLifecycle.ts`
- [ ] Add `game/units/unitAbilityLifecycle.interrupt.test.ts` covering:
  - A behaviour's `onInterrupt` fires on all four paths: knockback interrupt, stun interrupt, wall-unstick removal, and same-id recast.
  - The `interruptPolicy` combinations: cancel / skipToCooldown / duringCooldown ignore vs end.
  - Use a tiny engine from `testing/harness/buildTinyBattleEngine.ts` and a registered test ability, or stub `getAbility` the way existing lifecycle tests do (grep for one).
  - **Touches:** new test file; run it plus `card_defs/05_earth_core/0537_RockSlide/0537Ability.test.ts`

---

### Step 2 — Held projectiles and save/load of hit tracking

- [ ] Move `FIXED_DT` into `game/gameConstants.ts` and re-export it from `GameEngine.ts`, so existing imports keep working. Add `MAX_HELD_PROJECTILE_SECONDS = 5` next to it, with a doc comment explaining that it is an orphan safeguard, not a gameplay timer.
  - **Touches:** `game/gameConstants.ts`, `game/GameEngine.ts`
- [ ] Add a first-class held state to `Projectile`:
  - `heldBy: { unitId: string; abilityId: string } | null` and `heldTime: number`.
  - A static or helper `Projectile.spawnHeld(...)` (or constructor option `heldBy`), plus `release(velocityX, velocityY)` and `cancelHeld()`.
  - While held, `update()` does not move it, does not count distance, and `checkCollision` returns early. Remove the need for the `passThroughEnemies` / zero-velocity trick.
  - `heldTime += dt` each `update()` while held. When it exceeds `MAX_HELD_PROJECTILE_SECONDS`, set `active = false` (no expire effect, no `onProjectileExpired`) and log one warning containing: projectile id, `projectileType`, `sourceAbilityId`, `sourceUnitId`, `heldBy.unitId` / `heldBy.abilityId`, `heldTime`, x/y, `engine.gameTick` / `gameTime`, and whether the holder unit still exists, is alive, and still has an active cast of `heldBy.abilityId`.
  - Follow the logging convention used elsewhere in `game/` (grep `console.warn(` and any debug logger) and prefix the message with `[Projectile] held projectile orphaned`.
  - **Touches:** `game/projectiles/Projectile.ts`, `game/gameConstants.ts`
- [ ] Serialize `heldBy`, `heldTime`, `hitUnitIds` and `knockbackOnlyUnitIds` in `toJSON`/`fromJSON` (sets become arrays). Update the "not serialized" comments.
  - **Touches:** `game/projectiles/Projectile.ts`
- [ ] Extend `game/projectiles/Projectile.test.ts`:
  - A held projectile doesn't move or hit.
  - `release` makes it move and hit.
  - Exceeding the held limit deletes it and logs the warning (spy on the logger) with the holder ids in the message.
  - A JSON round-trip mid-flight keeps the hit sets: a unit already hit is not hit again after `fromJSON`.
  - **Touches:** `game/projectiles/Projectile.test.ts`; run that file only

---

### Step 3 — Projectile terrain rules and hit policy

- [ ] Add a terrain query for "blocks projectiles" using **effective** terrain (floor layer included).
  - Add `blocksProjectiles` to `TerrainProperties` (true for `Rock` and `Impassable`, mirroring the obstruction set used by `TerrainGrid.hasLineOfSight`). Add `TerrainManager.isProjectileObstructedAt(x, y)` and treat out-of-bounds as obstructed.
  - Read `TerrainType.ts` first. If adding a property is noisy because every terrain entry must list it, derive it from a small set constant instead and say so in the summary.
  - **Touches:** `terrain/TerrainType.ts`, `terrain/TerrainManager.ts`
- [ ] Turn wall-stopping into a travel modifier.
  - Add a `ProjectileTravelModifier.canTraverse?(terrainType): boolean` hook (stonephase: `true` for `Rock`) and a new modifier id `'stopsAtWalls'`.
  - In `Projectile.update`, when `stopsAtWalls` is present, sample the swept segment (reuse the per-pixel stepping in `calculateDistanceContribution`; do not test only the end point).
  - At the first sample that is projectile-obstructed **and** not traversable by another modifier, stop at the last free sample and expire (`triggerExpireEffect`).
  - **Stonephase takes priority:** while every obstructed sample is traversable by stonephase, keep flying. Stop at the first obstruction stonephase doesn't cover, or at max distance.
  - Remove `stopAtImpassable` and the **tile-centre snapping** from `Projectile`; resting-tile logic belongs to the ability's `onProjectileExpired`.
  - **Touches:** `game/projectiles/ProjectileTravelModifiers.ts`, `game/projectiles/Projectile.ts`
- [ ] Replace `pierce`/`continueAfterMaxHits`/`knockbackBeyondMaxHits`/`knockbackMode` plumbing with one `hitPolicy` object:
  - Shape: `{ damagingHits: number; overflow: 'stop' | 'passThrough' | 'knockbackOnly'; knockback?: { tier: number; direction: KnockbackDirectionStrategy } }`.
  - Keep the old constructor options working as deprecated aliases that map onto `hitPolicy`, so every other projectile behaves identically. List the mapping in a doc comment.
  - Put `KnockbackDirectionStrategy` (`{ kind: 'travel' } | { kind: 'sideOfTravel'; angleDeg: number }`) and a pure `resolveHitKnockbackDirection(strategy, travelDir, projectilePos, victimPos)` in `crowdControl/knockbackKeywords.ts`.
  - The projectile calls `applyDirectionalKnockback` with the resolved direction. Exactly centred victims keep today's tie-break (projectile's left / `+perp`).
  - **Touches:** `game/projectiles/Projectile.ts`, `crowdControl/knockbackKeywords.ts`, `abilities/CastBehaviours/ProjectileLaunchBehaviour.ts` (forward the policy)
- [ ] Move the hard-coded Throw Knife bleed (`THROW_KNIFE_ABILITY_ID` branch in `checkCollision`) into Throw Knife's own `abilityEvents` `ON_ATTACK_HIT` handler. `triggerAbilityEventFromAttack` already fires for projectile hits.
  - Read how another card declares `abilityEvents` before editing. If the event cannot reach the bleed with the same stack count and timing, pause and ask.
  - **Touches:** `game/projectiles/Projectile.ts`, `card_defs/0109_ThrowKnife/0109Ability.ts`
- [ ] Tests:
  - `Projectile.test.ts`: wall stop on a swept segment at high speed (no tunnelling); stonephase flies through rock then stops at an `Impassable` cell; stonephase reaching max distance inside rock expires there.
  - `crowdControl` test for `resolveHitKnockbackDirection` (both sides plus the centred tie-break, and the angle parameter).
  - Existing Throw Knife tests still green.
  - **Touches:** `game/projectiles/Projectile.test.ts`, new or existing `crowdControl/knockbackKeywords.test.ts`; run those plus `card_defs/0109_ThrowKnife/*.test.ts` and `0537Ability.test.ts`

---

### Step 4 — Shared terrain and tile-occupancy helpers

- [ ] Add rock helpers to `TerrainManager`:
  - `isInBounds(col, row)`.
  - `isIntactRockAt(col, row)`: in-bounds, effective terrain `Rock`, using the existing `isIntactRock`.
  - `destroyRock(col, row, sourceUnitId?)`: sets Rubble, notifies nav, and emits the same stone-damaged transition as a destroying `damageRock`. Make `consumeRockInRadius` reuse it.
  - **Touches:** `terrain/TerrainManager.ts`
- [ ] Add `getUnitsInTiles(units, tiles, predicate?)` (unit centre's tile ∈ tiles) to `abilities/tileAreaHelpers.ts`. Document why it is not `CellOccupancyManager` (that manager only tracks units with `maxPerTile`, from a once-per-tick snapshot).
  - **Touches:** `abilities/tileAreaHelpers.ts`
- [ ] Replace the per-file `EngineLike` / `terrainManager` shape declarations in Earth abilities with `AbilityEngineContext`. Add any missing members, such as `projectiles` (read-only), to `abilities/AbilityEngineContext.ts`.
  - Switch Gather Stone's in-bounds / rock checks to the new TerrainManager helpers and `getUnitsInTiles`, with no behaviour change.
  - Do not touch Rock Slide or Stone Tomb here; Steps 10–11 port them.
  - **Touches:** `abilities/AbilityEngineContext.ts`, `card_defs/05_earth_core/0525_ShakingGround/0525Ability.ts`, `0534_DiggingClaws/0534Ability.ts`, `0536_GatherStone/0536Ability.ts`
- [ ] Add a TerrainManager unit test for `destroyRock` (bedrock rock and player-made rock both become Rubble and emit the event) and `isIntactRockAt` (out of bounds is false).
  - **Touches:** existing TerrainManager test file (grep) or a new `terrain/TerrainManager.rock.test.ts`; run it plus `0536Ability.test.ts` and `0534`/`0525` tests if present

---

### Step 5 — Entombed gap: forced movement can escape a wall it starts in

- [ ] In `computeForcedDisplacement`, when the **start** point is impassable, let the displacement step through impassable samples until it first reaches a passable sample, then apply the normal wall collision from there.
  - If no passable sample is reached within `maxDistance`, keep today's zero displacement so wall-unstick still handles it.
  - Only knockbacks that *start* inside a wall are affected; normal knockbacks into walls are unchanged.
  - If any existing test relies on the old cancel behaviour (grep `computeForcedDisplacement` tests and the comment in `unitWallUnstick.ts` about knockback being cancelled), pause and ask before changing that test.
  - **Touches:** `game/forceMove.ts`, `game/units/unitWallUnstick.ts` (update the comment)
- [ ] Add `game/forceMove.test.ts` cases (or extend the existing file): a start inside a wall with a passable exit along the direction escapes; a start inside a wall with no exit within range gives zero; a normal start that hits a wall is unchanged.
  - **Touches:** `game/forceMove.test.ts`; run it plus `card_defs/05_earth_core/0530_StoneTomb/0530Ability.test.ts`

---

### Step 6 — Select lookahead: same-tick effects happen before the pause

**Desired rule:** when the player is asked for a mid-cast target at elapsed `s`, the world reflects everything the cast scheduled **at or before `s` that is declared ahead of that select interval**. That includes intervals ending at `s` and their `isLastTick` behaviour hooks, and `doCardEffect`/behaviour work for elapsed ≤ `s`. The select interval (and anything declared after it that starts at `s`) enters on the next tick. Preview and committed runs must stay fingerprint-identical.

- [ ] Implement a **select gate** in ability ticking.
  - When a cast's next tick window `(prev, next]` contains the start `s` of an interactive select interval whose gate hasn't been passed, process that cast only up to `s` on that tick, then mark the gate pending (e.g. `active.passedSelectGates: string[]` or a single `pendingSelectGate`).
  - Persist the processed elapsed so the next tick resumes from `s`, not from `gameTime − startTime`. Extend `computeTickElapsed`; do not reimplement it inline.
  - Apply the gate **identically in committed and preview runs**: decide from the timing structure, never from whether the label is resolved, so fingerprints match. Serialize the new `ActiveAbility` field.
  - **Touches:** `game/units/unitAbilityTick.ts`, the module that defines `computeTickElapsed` (grep), `game/types.ts` (`ActiveAbility`), unit serialization (`game/units/unitFromJSON.ts` and `Unit.toJSON`)
- [ ] Make the lookahead pause before the tick in which the **gated** select interval enters: the tick after the gate tick. Update `findImpendingSelectTargetNeed` / `findImpendingNeedForCast` and the deferred-first-select helper only as needed.
  - **Touches:** `game/interaction/selectTargetLookahead.ts`, `game/GameEngine.ts` (`fixedUpdate`)
- [ ] Tests:
  - A new `game/interaction/selectTargetLookahead.gate.test.ts`. Use a test ability with an `Instant` behaviour on an interval ending exactly at the select start. Assert the side effect is visible while `engine.waitingForTargetInput` is set, and that a committed run produces the same `gameTick`-by-tick fingerprint (follow the parity pattern in `game/interactiveTargeting.test.ts`).
  - Run `game/interactiveTargeting.test.ts` and `game/interaction/*.test.ts` as the targeted regression set. These are the only broader files allowed in this step because parity is the risk.
  - **Touches:** new test file; listed test files only
- [ ] Update the "Select-target lookahead" section of `docs/interactive-sequential-targeting.md` with the gate rule.
  - **Touches:** `docs/interactive-sequential-targeting.md`

---

### Step 7 — One tile-area hitbox

- [ ] Create `hitboxes/TileAreaHitboxSpec.ts` with:
  - `anchor`: `{ kind: 'chebyshev'; maxTileOffset: number } | { kind: 'adjacentCardinal' }`.
  - `shape`: a list of tile offsets, with presets `tileShapes.square(half)`, `tileShapes.plus()`, `tileShapes.single()`.
  - `castRange` and `style` (use a named palette: add `TELEGRAPH_STYLES` with `danger`, the red style used by Stone Tomb and Rock Slide, and `earth`, Gather Stone's amber, in a small shared module such as `abilities/telegraphStyles.ts`).
  - `directionArrow?: boolean`, valid only with `adjacentCardinal`; draws the arrow in the anchor tile.
  - Public `resolveAnchor(caster, aim)` and `resolveCells(caster, aim)`, the single source of geometry for the preview **and** ability effects.
  - Preview: fill each cell, then stroke only the **outer edges of the union of cells** (edges shared by two cells cancel). This generic outline replaces the hand-coded plus perimeter. Keep optional internal grid lines for the square preset to match Gather Stone's look.
  - Move the arrow-drawing helper from `0537Ability.ts` into `abilities/previewHelpers.ts`.
  - **Touches:** new `hitboxes/TileAreaHitboxSpec.ts`, `hitboxes/index.ts`, `abilities/tileAreaHelpers.ts`, `abilities/previewHelpers.ts`, new `abilities/telegraphStyles.ts`
- [ ] Migrate the callers and delete the old hitboxes:
  - Gather Stone (square, chebyshev 2).
  - Stone Tomb (plus, chebyshev 4).
  - Rock Slide (single + chebyshev 2; single + adjacentCardinal with arrow).
  - Ability effect code must derive cells via the hitbox's `resolveCells`, not by re-calling the snap helpers with its own constants.
  - Delete `SquareTileAreaHitboxSpec.ts`, `PlusTileAreaHitboxSpec.ts` and `TileSelectHitboxSpec.ts`, plus helpers that become unused (`plusTileAreaPerimeter`, `drawPlusTileArea`, `drawTileHighlight`, `squareTileAreaWorldRect` if unused).
  - Update `hitboxes/SKILL.md`.
  - **Touches:** `card_defs/05_earth_core/0536_GatherStone/0536Ability.ts`, `0530_StoneTomb/0530Ability.ts`, `0537_RockSlide/0537Ability.ts`, `hitboxes/index.ts`, `hitboxes/SKILL.md`, the three old hitbox files, `abilities/tileAreaHelpers.ts`
- [ ] Add `hitboxes/TileAreaHitboxSpec.test.ts` covering:
  - Anchor clamping for both anchor kinds, including the diagonal dominant-axis rule and aim-on-caster → null.
  - Cells for each preset.
  - The outline segment count for single (4), plus (12) and 3×3 square (12).
  - Update `0536Ability.test.ts`, `0530Ability.test.ts` and `0537Ability.test.ts` imports.
  - **Touches:** new test plus the three ability tests; run those four files

---

### Step 8 — `validatePick` used by preview, AI and execution

- [ ] Show invalid picks in the preview.
  - Add optional `HitboxSpec.renderInvalidPreview(gr, caster, aim)`: the default draws a grey X at the aim; `TileAreaHitboxSpec` greys the cells and draws an X per anchor tile.
  - In `PreviewRenderer`'s select rendering, resolve the pick the same way the click does (refactor `resolveItsSelectTargetForClick`'s clamp part into a shared pure helper if needed). When `selectDef.validatePick` returns false, call `renderInvalidPreview` instead of the normal preview.
  - Remove Rock Slide's `renderTargetingPreviewSelectedTargets` overlay.
  - **Touches:** `hitboxes/HitboxSpec.ts`, `hitboxes/TileAreaHitboxSpec.ts`, `game/GameRenderer/renderers/PreviewRenderer.ts`, `game/interaction/itsCanvasInput.ts`, `abilities/targeting.ts`, `card_defs/05_earth_core/0537_RockSlide/0537Ability.ts`
- [ ] Respect `validatePick` in AI and execution:
  - **AI:** `buildAiSelectTargets` returns no targets / marks the ability unusable when any built pick fails `validatePick`. Grep how callers handle an unusable result; pause and ask if there is no such path.
  - **Execution:** when a select interval with `validatePick` **enters** (committed or preview run, after Step 6's gate), re-validate the resolved target. If it is invalid, end the cast through the cancel path (`cancelUnitActiveAbility`, refunding per policy) — a generic "fizzle".
  - Remove now-redundant defensive checks from Rock Slide and Stone Tomb in Steps 10–11.
  - **Touches:** `abilities/targeting.ts`, `game/units/unitAbilityTick.ts`, `game/units/unitAbilityLifecycle.ts`
- [ ] Tests: AI skips an ability whose pick is invalid; a committed order whose rock tile was removed before the select interval entered fizzles (no projectile, the cast ends). Put these in `0537Ability.test.ts` or a new `abilities/validatePick.test.ts`.
  - **Touches:** the listed test files; run only those

---

### Step 9 — Reusable cast-behaviour building blocks

- [ ] Create `abilities/easing.ts` (`easeOutCubic`, `easeInOutQuad`, plus whatever `ui/abilityUseChargeAnimation.ts` uses) and replace the private copies in `MeleeAttack.ts`, `ui/abilityUseChargeAnimation.ts` and `0537Ability.ts`.
  - **Touches:** new `abilities/easing.ts`, `abilities/CastBehaviours/MeleeAttack.ts`, `ui/abilityUseChargeAnimation.ts`, `card_defs/05_earth_core/0537_RockSlide/0537Ability.ts`
- [ ] Add `CastBehaviours.CasterSlide({ forwardDistance, backwardDistance, impactAt, direction: (ctx) => {x,y} | null })` (render-only via `getCasterRenderOffset`) by extracting the slide maths from `MeleeAttack`.
  - `MeleeAttack.withSlide` must delegate to it, with no visual change for melee abilities.
  - Add `CastBehaviours.CasterShake({ from, to })`, an amplitude ramp over its window, deterministic (no `Math.random`).
  - Add `CastBehaviours.Instant(fn, { at: 'start' | 'end' })`, where `'end'` fires on `isLastTick`. Default `'start'` keeps current behaviour.
  - **Touches:** `abilities/CastBehaviours/index.ts`, new `abilities/CastBehaviours/CasterSlideBehaviour.ts`, `abilities/CastBehaviours/CasterShakeBehaviour.ts`, `abilities/CastBehaviours/InstantBehaviour.ts`, `abilities/CastBehaviours/MeleeAttack.ts`
- [ ] Extend `ProjectileLaunchBehaviour`:
  - `withOrigin((ctx) => point)` (default: caster).
  - `withDirection((ctx) => unitVector)` (default: toward the target as today).
  - `withHitPolicy(...)` and `withModifiers` passthrough.
  - `withHold({ onCancelled?: (ctx, projectile) => void })`. When held, `onSetup` spawns via `Projectile` held state (Step 2) with `heldBy = { caster.id, abilityId }`, the projectile id goes in the behaviour payload, the window's `isLastTick` releases it, and `onInterrupt` calls `cancelHeld()` then `onCancelled`.
  - Because Step 1 routes every early cast end through `cleanupCastBehavioursForAbility`, held projectiles can no longer be orphaned by cast removal; the Step 2 timer remains as the last-resort safeguard.
  - **Touches:** `abilities/CastBehaviours/ProjectileLaunchBehaviour.ts`
- [ ] Add a behaviour test file `abilities/CastBehaviours/behaviours.test.ts` covering:
  - `CasterSlide` offsets at 0, impact and end.
  - `Instant({at:'end'})` fires once on the last tick.
  - A held `ProjectileLaunch`: spawned held → released at window end → moving. Interrupted inside the window → `onCancelled` called, projectile inactive. Same-id recast inside the window → cancelled (relies on Step 1).
  - Run it plus the MeleeAttack tests (`abilities/CastBehaviours/*.test.ts`).
  - **Touches:** new test file

---

### Step 10 — Port Rock Slide onto the shared systems

- [ ] Rewrite `0537Ability.ts` with `defineAbility` and declarative intervals; **no `doCardEffect`, no `crossed()`, no `castPayload`**. Suggested structure (adjust ids or times only if Step 6's gate requires):
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
- [ ] Update `0537Ability.test.ts`:
  - Keep every behavioural assertion: the timeline order, the dormant → held projectile, the three interrupt cases, five damaging hits plus overflow knockback, side directions, and pick validation.
  - Adjust only internals (no `velocityX === 0` dormant check; assert `heldBy` instead).
  - Replace the hand-copied `resolveOrderPause` with a helper exported from `testing/runner/SimulationRunner.ts` (export the existing `maybeAutoResolveParallelOrderPause` or a `stepTick(engine)` wrapper).
  - Add cases: same-id recast while holding → rock at the spawn tile, projectile gone; ITS preview pause for `Direction` sees the rock tile already Rubble (uses Step 6).
  - **Touches:** `0537Ability.test.ts`, `testing/runner/SimulationRunner.ts`; run `0537Ability.test.ts` only

---

### Step 11 — Port Stone Tomb onto the shared systems

- [ ] Rewrite `0530Ability.ts` with `defineAbility` and declarative intervals; no `doCardEffect`.
  - Stage 1 and stage 2 become `Instant` behaviours with `targetDef: { kind: 'hit', labels: [...] }`. Cells come from the hitbox's `resolveCells`; occupants come from `getUnitsInTiles`.
  - Use `movementLock` instead of the hand-written `getAbilityStates`.
  - Keep behaviour identical:
    - Enemies take damage.
    - Allies and the caster in the centre are knocked back undamaged.
    - The rock rises in the centre in stage 1.
    - Stage 2 raises the 4 outer rocks.
  - With Step 5, centre-tile victims are now actually shoved out of the new rock. Update the test expectation if one asserted otherwise.
  - **Touches:** `card_defs/05_earth_core/0530_StoneTomb/0530Ability.ts`, `0530Ability.test.ts`, `earthCoreConstants.ts`; run `0530Ability.test.ts` only

---

### Step 12 — Research and tooltip text from constants

- [ ] Build the Stone Tomb and Rock Slide research-node descriptions in `app/js/researchTrees/trees/earth.ts` from the exported constants with template strings (as Earth Attuned does), keeping the `{n}` highlight braces. Do the same for both abilities' tooltips.
  - **Touches:** `app/js/researchTrees/trees/earth.ts`, `0530Ability.ts`, `0537Ability.ts`; run `app/js/researchTrees/treeAbilities.test.ts` and `earthMetalCosts.test.ts`

---

### Step 13 — AbilityTest scenarios and docs

Create the scenarios here but **do not run `SimulationRunner.test.ts` in this step** (Step 14 does).

- [ ] Add these scenarios to `testing/scenarios/abilities/earthCoreScenarios.ts`, register them in `testing/scenarios/registry.ts` (both lists that `earthCoreStoneTombScenario` appears in), and add `it(...)` entries in `testing/runner/SimulationRunner.test.ts`:
  - `earthCoreRockSlideLandsOnEnemyScenario`: Rock Slide's projectile stops at a wall tile where a damaged-but-alive dummy is standing in the resting tile. Pass when the resting tile is Rock **and** the dummy ends outside rock (wall-unstick handled it) and alive. Covers the wall stop + Entombed/unstick hand-off.
  - `earthCoreStoneTombCentreEscapeScenario`: a dummy in the Stone Tomb centre tile ends the cast outside the centre tile, which is Rock, having taken at least the stage-1 damage. Covers the Step 5 fix.
  - `earthCoreRockSlideStonephaseScenario` **only if** a stonephase source can be applied to Rock Slide without a new research node. Otherwise skip it and note that in the summary (stonephase priority is unit-tested in Step 3).
  - Assertions must be structural (tile types, inside/outside rock, alive or hit) rather than exact HP, and deterministic.
  - **Touches:** listed files
- [ ] Update the docs:
  - `abilities/AGENTS.md`: the interrupt pipeline and `interruptPolicy`, held projectiles, the new behaviours, `validatePick`, and the select gate rule.
  - `card_defs/05_earth_core/EarthCore.md`: Rock Slide and Stone Tomb entries, and the shared terrain helpers.
  - `game/projectiles` AGENTS or SKILL file if one exists (grep), otherwise a short section in `abilities/AGENTS.md`: `hitPolicy`, `stopsAtWalls`, stonephase priority, held state, orphan warning.
  - Follow `writing-nested-agents-files`.
  - **Touches:** listed docs

---

### Step 14 — Final verification (run the expensive things once)

- [ ] `npm run lint` and `npx tsc --noEmit` — zero errors.
- [ ] Run the AbilityTest scenarios: `npx vitest run app/js/games/minion_battles/testing/runner/SimulationRunner.test.ts`. All Earth scenarios (existing and new), Knock (stonephase), Throw Knife, Double Punch and swing scenarios must pass. Record pre-existing failures separately.
- [ ] Run the broad suite once: `npm run test`. Compare failures with the orchestrator's baseline and fix any new failure, or record it with a justification.
- [ ] Write a manual browser checklist into this plan for the user. Do not attempt it unless a browser tool is available and the user asked.
  - Rock Slide in ITS: invalid rock tile shows grey X and rejects the click; valid rock → shake + chips; rock becomes rubble **before** the Direction pause; the direction arrow follows the cursor; the rubble tile is a legal Direction pick; punch slide; rock flies, knocks units diagonally off its path, and lands as rock at the wall.
  - Rock Slide stunned during the punch-in → rock appears on the spawn tile; no flying rock.
  - Stone Tomb: plus telegraph outline is a single perimeter; centre enemy is pushed out before the rock rises.
  - Gather Stone telegraph unchanged in look.

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
