# abilities/

Declarative cast timing, targeting, hitboxes, and reusable cast behaviours for Minion Battles. Card-specific definitions live under `card_defs/`; this folder owns the shared runtime contracts those defs call into.

## Folder map

| Path | Owns |
|------|------|
| `CastBehaviours/` | Reusable timed behaviours (`CastBehaviours.MeleeAttack()`, Dash, ProjectileLaunch, Instant, CasterSlide, CasterShake, …). Prefer these over new `doCardEffect` melee boilerplate. |
| `tileAreaHelpers.ts`, `telegraphStyles.ts`, `easing.ts`, `previewHelpers.ts` | Tile-area geometry and occupancy (`getUnitsInTiles`), named telegraph palettes, easing curves, and preview drawing. Tile hitboxes themselves are in `hitboxes/TileAreaHitboxSpec.ts`. |
| `Ability.ts` / `AbilityRegistry.ts` | Ability static contract and id → ability lookup. New abilities must `register(...)` here or they are silently missing at runtime. |
| `abilityTimings.ts` | Timing intervals, `emitterDef`, and `getEffectiveCastBehaviours` (normalises `castBehaviours` vs `behaviour` shorthand). Interval enter detection must treat `start: 0` correctly (`enteredTimingIds` special-cases the first tick — needed for emitters and Instant behaviours). |
| `timingTargetDef.ts` / `targeting.ts` | `SelectTargetDef` lock-on / filters (`allowMiss`, `filter`, `filterSelectTargetCandidates`). Legacy `TargetDef` is label-only — do not look for `lockOn` there. |
| `hitboxDef.ts` | Pure hitbox data + `resolveHitbox`. When a `priorityUnitId` is set and that unit is out of the shape, the result is empty (miss), not a redirect to another unit. |
| `castBehaviourTypes.ts` / `resolveCastBehaviourTarget.ts` | Behaviour context, `targetIndex`, interrupt typing. |
| `targetDowngrade.ts` | Freezes unit targets to pixels when they die (pair with evade/tether handling in the ability tick). |
| `keywords/` | Reusable ability keywords (`bright`, `knockback`, `devourLight`), registry, and cast-time runner. See `keywords/AGENTS.md`. |

## CastBehaviours — load-bearing rules

- **Coexistence:** `doCardEffect` remains an escape hatch. New declarative abilities omit it. Ability-level `getCasterRenderOffset` and behaviour offsets are summed. `beginActiveCast` is still for cast-start setup; behaviour `onSetup` runs when that behaviour’s timing window opens.
- **Lock-on is independent of behaviours:** use `SelectTargetDef` + hitbox specs for pick/lock; pair with whatever `castBehaviours` fit the strike (e.g. teleport then melee).
- **Multi-target entries:** one behaviour instance can be reused with different `targetIndex` values; `onSetup`/`onTick` run per entry when its window opens.
- **Interrupt:** active sustained behaviours get `onInterrupt` when the cast is forcibly removed; already-finished windows do not.
- **Aim source of truth:** `active.targets` / `targetsByLabel` must be downgraded to pixel when a locked unit evades, breaks tether, or dies — otherwise later ticks chase the live unit. See `targetDowngrade.ts` and the evade/tether blocks in the unit ability tick.
- **Render offsets:** any code that walks timing intervals for caster slide/offset must use `getEffectiveCastBehaviours`, or the `behaviour:` shorthand is skipped.
- **Melee line preview/hits:** `MeleeLineHitboxSpec` projects aim to full `maxRange` (not click distance). Team filtering for select-target is caller-side via `filterSelectTargetCandidates`.
- **Self-displacement owns walking:** While an ability is sliding the caster, the engine claims exclusive movement for that tick. Walk orders are kept but not advanced; walking resumes when the slide stops, even if the cast is still in cooldown. Dash and lunge do this automatically. Custom slides must use the same unit displacement helpers so they inherit it. Do not add a timing tag or movement-lock for this — windup plant-feet remains a separate movement-lock on the ability. See `Unit` and the dash/lunge behaviours.

## Interrupts: one pipeline

- Every early end of a cast goes through `interruptUnitAbilities` (`game/units/unitAbilityLifecycle.ts`): knockback, stun, wall-unstick removal and a same-id recast. Per cast it fires `ON_CAST_END`, runs behaviour cleanup (`onInterrupt` on the live behaviours), then applies the ability's policy. Do not add a new ad-hoc end path or interrupt hook.
- `interruptPolicy` on `AbilityStatic` decides the outcome. `beforeCooldown` is `cancel` (refund) or `skipToCooldown`. `duringCooldown` is `ignore` (keep the cast) or `end`. The defaults are cancel and ignore. Rock Slide ends during cooldown, and ChargeAttack and MultiChargeAttack skip to cooldown.
- A rejected select pick ends the cast through `fizzleUnitActiveAbility`, which applies the same policy. It does not use `cancelUnitActiveAbility`, because that path does not refund.

## Select gate and `validatePick`

- A select with `start > 0` that begins inside a tick splits that tick. The cast is processed up to the start, and `processedElapsed` and `pendingSelectGate` are saved. The select enters on the next tick, and the ITS lookahead pauses before that tick. That tick force-enters the select even if it has already ended (`selectGateDeferredIds`), so a one-tick select is fine. The decision depends only on timing structure, so preview and committed runs match. Start-0 selects are not gated (`findSelectGateSplit` in `game/interaction/selectTargetLookahead.ts`), so a start-0 select still needs two ticks.
- Snapping to cooldown clears the gate fields. Any new path that rewrites `active.startTime` must clear them too.
- `validatePick` is checked in three places. The preview draws `renderInvalidPreview` (grey, with a cross) instead of the normal telegraph. AI `buildAiSelectTargets` returns `valid: false`, so the plan is dropped. When a select enters, a rejected pick fizzles the cast.

## Held projectiles

- `ProjectileLaunch().withHold()` spawns the projectile held at its origin. A held projectile does not move, count distance or collide. It is released on the window's last tick. If the cast is interrupted first, `onInterrupt` cancels it and calls `onCancelled`, which is where a cast settles the rock or effect it was carrying.
- Orphan safeguard: a held projectile older than `MAX_HELD_PROJECTILE_SECONDS` (`game/gameConstants.ts`) is deleted with a `[Projectile] held projectile orphaned` warning. The warning means a cast leaked. It is not a gameplay timer.

## Projectiles used by abilities

- `hitPolicy` on the projectile: `damagingHits`, `overflow` (`stop`, `passThrough` or `knockbackOnly`), and an optional `knockback` with a direction strategy (`travel` or `sideOfTravel`). The old options (`pierce`, `continueAfterMaxHits`, `knockbackBeyondMaxHits`, `knockbackTier`, `knockbackMode`) are deprecated aliases. The mapping is in `hitPolicyFromLegacyOptions` (`game/projectiles/Projectile.ts`).
- `stopsAtWalls` (`game/projectiles/ProjectileTravelModifiers.ts`) stops the projectile at the first sample that is projectile-obstructed. Obstruction uses effective terrain, including the floor layer, and out-of-bounds counts as obstructed. The swept segment is sampled per pixel, so there is no tunnelling and no tile snapping. The ability's `onProjectileExpired` decides what the resting tile becomes.
- Stonephase has priority. It traverses Rock, so the projectile keeps flying through rock, and `stopsAtWalls` stops it at the first obstruction that no modifier traverses. Stonephase is granted only to Knock (0531) today.
- Knockback that starts inside a wall escapes it (`updateUnitKnockback` in `game/units/unitKnockback.ts`). While a tick's segment starts inside a wall, the unit moves the full segment without terrain collision and the knockback stays alive. Collision resumes once the unit is on passable ground. A knockback that ends inside the wall leaves the unit there for `tickWallUnstick`. The push must be long enough to clear the tile: from a tile centre that is half a tile. Dashes, lunges, nudges and Lifted still cannot start moving from inside a wall (`computeForcedDisplacement` returns zero).

Authoring workflow and registration checklist: `card_defs/SKILL.md` and the **creating-an-ability** skill.
