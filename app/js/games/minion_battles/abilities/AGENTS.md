# abilities/

Declarative cast timing, targeting, hitboxes, and reusable cast behaviours for Minion Battles. Card-specific definitions live under `card_defs/`; this folder owns the shared runtime contracts those defs call into.

## Folder map

| Path | Owns |
|------|------|
| `CastBehaviours/` | Reusable timed behaviours (`CastBehaviours.MeleeAttack()`, Dash, ProjectileLaunch, Instant, CasterSlide, CasterShake, …). Prefer these over new `doCardEffect` melee boilerplate. |
| `tileAreaHelpers.ts`, `telegraphStyles.ts`, `easing.ts`, `previewHelpers.ts` | Tile-area geometry and occupancy (`getUnitsInTiles`), named telegraph palettes, easing curves, and preview drawing. Tile hitboxes themselves are in `hitboxes/TileAreaHitboxSpec.ts`; its `tileShapes` (incl. `disc(r)`) and `cellsAroundPoint` also serve non-select AoEs (e.g. Thornbinder's landing footprint), with `damageEnemiesInTiles` / `placeJitteredGroundThorns({ cells })` in `targetHelpers.ts` so effect and `drawTileAreaTelegraph` preview share one cell list. |
| `Ability.ts` / `AbilityRegistry.ts` | Ability static contract and id → ability lookup. New abilities must `register(...)` here or they are silently missing at runtime. |
| `abilityTimings.ts` | Timing intervals, `emitterDef`, and `getEffectiveCastBehaviours` (normalises `castBehaviours` vs `behaviour` shorthand). Interval enter detection must treat `start: 0` correctly (`enteredTimingIds` special-cases the first tick — needed for emitters and Instant behaviours). |
| `timingTargetDef.ts` / `targeting.ts` | `SelectTargetDef` lock-on / filters (`allowMiss`, `filter`, `filterSelectTargetCandidates`). Legacy `TargetDef` is label-only — do not look for `lockOn` there. |
| `hitboxDef.ts` | Pure hitbox data + `resolveHitbox`. When a `priorityUnitId` is set and that unit is out of the shape, the result is empty (miss), not a redirect to another unit. |
| `castBehaviourTypes.ts` / `resolveCastBehaviourTarget.ts` | Behaviour context, `targetIndex`, interrupt typing. |
| `targetDowngrade.ts` | Freezes unit targets to pixels when they die (pair with evade/tether handling in the ability tick). |
| `keywords/` | Reusable ability keywords (`bright`, `knockback`, `devourLight`), registry, and cast-time runner. See `keywords/AGENTS.md`. |

## Per-cast ability modes

- `abilityModes` (`AbilityModesConfig` in `Ability.ts`) declares per-cast modes. Cards with modes show an always-visible `AbilityModeStrip` under the card (card shrinks so card + gap + strip = `ABILITY_SLOT_HEIGHT_PX`); `toggleStyle: 'segmentedAbove'` (Wait) is separate.
- New abilities with modes must supply `modeLabels` (short, fits 3 segments in a 108px card) **and** `modeDescriptions` (one terse sentence per mode, used as the segment tooltip). Shared label sets live next to the family constants (e.g. `GRAVITY_ABILITY_MODE_LABELS`).

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
- The pipeline and the fizzle both emit `cast_ended_early` on the engine EventBus (`CastEndedEarlyEvent` in `game/EventBus.ts`), with the cause derived from unit state. It is the single hook for UI, logs and ITS; do not add per-call-site notifications.

## Select gate and `validatePick`

- A select with `start > 0` that begins inside a tick splits that tick. The cast is processed up to the start, and `processedElapsed` and `pendingSelectGate` are saved. The select enters on the next tick, and the ITS lookahead pauses before that tick. That tick force-enters the select even if it has already ended (`selectGateDeferredIds`), so a one-tick select is fine. The decision depends only on timing structure, so preview and committed runs match. Start-0 selects are not gated (`findSelectGateSplit` in `game/interaction/selectTargetLookahead.ts`), so a start-0 select still needs two ticks.
- Snapping to cooldown clears the gate fields. Any new path that rewrites `active.startTime` must clear them too.
- `validatePick` is checked in three places. The preview draws `renderInvalidPreview` (grey, with a cross) instead of the normal telegraph. AI `buildAiSelectTargets` returns `valid: false`, so the plan is dropped. When a select enters, a rejected pick fizzles the cast.
- Missing select labels: a committed order lists the labels it lacks in `missingSelectLabels`, saved on the cast. At the select gate the owner is paused in the real timeline (`awaitingPickLabel`) and answers with an `updateTargets` order. Inside other players' previews the pause is dropped (automatic pass-and-fizzle). Pass, no pick, or a non-player-controlled caster fizzles the select on entry. The ITS lookahead never pauses for a missing label. These checks read only saved cast data, never `targetsByLabel`.

## Held projectiles

- `ProjectileLaunch().withHold()` spawns the projectile held at its origin. A held projectile does not move, count distance or collide. It is released on the window's last tick. If the cast is interrupted first, `onInterrupt` cancels it and calls `onCancelled`, which is where a cast settles the rock or effect it was carrying.
- Orphan safeguard: a held projectile older than `MAX_HELD_PROJECTILE_SECONDS` (`game/gameConstants.ts`) is deleted with a `[Projectile] held projectile orphaned` warning. The warning means a cast leaked. It is not a gameplay timer.

## Projectiles used by abilities

- `hitPolicy` on the projectile: `damagingHits`, `overflow` (`stop`, `passThrough` or `knockbackOnly`), and an optional `knockback` with a direction strategy (`travel` or `sideOfTravel`). The old options (`pierce`, `continueAfterMaxHits`, `knockbackBeyondMaxHits`, `knockbackTier`, `knockbackMode`) are deprecated aliases. The mapping is in `hitPolicyFromLegacyOptions` (`game/projectiles/Projectile.ts`).
- `stopsAtWalls` (`game/projectiles/ProjectileTravelModifiers.ts`) stops the projectile at the first sample that is projectile-obstructed. Obstruction uses effective terrain, including the floor layer, and out-of-bounds counts as obstructed. The swept segment is sampled per pixel, so there is no tunnelling and no tile snapping. The ability's `onProjectileExpired` decides what the resting tile becomes.
- `withCollidesWithTerrain([TerrainType.Rock])` (`Projectile.collidesWithTerrain`, serialized) stops the projectile at any listed terrain type, using the same per-pixel sampling and expiry path as `stopsAtWalls`, but independent of `blocksProjectiles`. Use it to opt an ability into colliding with specific terrain (Slime Shot collides with Rock). Stonephase still traverses Rock.
- Stonephase has priority. It traverses Rock, so the projectile keeps flying through rock, and `stopsAtWalls` stops it at the first obstruction that no modifier traverses. Stonephase is granted only to Knock (0531) today.
- Structures (`UnitTag.Structure`, e.g. nests) cannot be pushed out of rock raised on their tile. `tickWallUnstick` calls `resolveStructureInTerrain` (`game/units/unitWallUnstick.ts`): the rock is destroyed (`TerrainManager.destroyRock`, leaving rubble) and the structure takes its def-level `terrainCrushDamage` once (default `DEFAULT_STRUCTURE_TERRAIN_CRUSH_DAMAGE` = 10 in `unitDef.ts`). Non-rock walls are left alone and deal no damage.
- Knockback that starts inside a wall escapes it (`updateUnitKnockback` in `game/units/unitKnockback.ts`). While a tick's segment starts inside a wall, the unit moves the full segment without terrain collision and the knockback stays alive. Collision resumes once the unit is on passable ground. A knockback that ends inside the wall leaves the unit there for `tickWallUnstick`. The push must be long enough to clear the tile: from a tile centre that is half a tile. Dashes, lunges, nudges and Lifted still cannot start moving from inside a wall (`computeForcedDisplacement` returns zero).

## Visuals at a pause plane (`pauseBehaviour`)

At a pause plane (waiting for orders or target input, or an explicit pause), game ticks stop but the render loop keeps running. Every effect and emitter an ability creates says what it does then through `pauseBehaviour`. The engine side is in `game/effects/pauseBehaviour.ts` and `game/effects/AGENTS.md`. The goal is a paused battlefield that still shows what is happening.

| Setting | While paused | Use it for | Examples |
|---|---|---|---|
| `'continue'` | Keeps animating, and emitters keep emitting, on real time. | State that is still true while paused: windups, channels, fields, auras, charge-ups, anything telling the player "this is in progress". | Ability-timing emitters (the default), the Gravity Locus field, the Ease Burdens tempo particles. |
| `'hold'` | Freezes in its current pose; emitters stop with their timers frozen. | A snapshot of motion. It would mislead if it kept animating on a stopped unit, or vanish if it kept fading. | Dash and Digging Claws afterimages. |
| `'stop'` | Removed as soon as the game pauses. | Visuals that mean nothing out of motion and would only clutter a paused frame. | Nothing yet. Prefer `'hold'` unless the frozen frame is actually confusing. |

Rules of thumb:

- Ask what the player should read from a frozen frame. If the visual describes current state, use `'continue'`. If it records movement that has stopped, use `'hold'`.
- Defaults:
    - Ability-timing emitters (`emitterDef` via `createEmitterFromDef`) are `'continue'`. Set `pauseBehaviour` on the def to opt out.
    - Hand-built `Effect`s are `'continue'`, except `timeDomain` `'world'` / `'owner'` ones, which are `'hold'`.
    - Hand-built emitters are `'hold'`. The legacy `emitWhilePaused: true` means `'continue'`.
- Set the effect and its emitter separately. A dash trail's emitter must not keep stamping afterimages on a stationary caster, while the afterimages already on screen should stay (`'hold'`).
- A visual for a buff's state belongs in `Buff.renderEmit` or `Buff.particleAura`, not in `onGameTick`. `onGameTick` does not run at a pause plane, so the visual goes blank. Both hooks run on the render loop and are rebuilt from serialized buff state, so they survive reconnects.
- Anything that emits while paused runs a frame-rate-dependent number of times on each client. Emitter factories and `renderEmit` must stay purely visual: no engine RNG, no game-state changes. Spawn jitter should use precomputed values or a local hash RNG, as `buffParticleAura.ts` does.

## Terrain clearing

Erases ground and air layer effects (bramble, thorns, ...) from tiles. It is an engine system so wind (air), explosions (both) and projectiles that are not grid-aligned can reuse it. The floor layer (rock, rubble) is never touched. Code is in `game/terrainEffects/terrainClearing.ts` and `game/TerrainLayerManager.ts`.

- **Specs:** a `TerrainClearSpec` names the layers and can filter by effect type and team. `TERRAIN_CLEARS` has the presets: `scour` (ground), `gust` (air) and `blast` (both). Rock Slide and Stone Tomb use `scour` with no team filter.
- **Entry point:** `clearTerrainEffects` clears a list of tiles or an area. It clears every matching record on a cell, not just the visible one, so an older overlapping effect cannot show through. Multi-cell records are carved: the record keeps its id and loses only the cleared cells. The call is timed in the performance tracker.
- **Projectiles:** `ProjectileLaunchBehaviour.withTerrainClear(spec)` sweeps the tiles along each tick's path. The sweep width defaults to the projectile radius, so projectiles do not have to be grid-aligned. A held projectile clears nothing until it is released.
- **Declarative effect:** the `clearTerrainEffects` ability-event effect clears a circle, for explosion and wind abilities.
- **Rock rule:** `TerrainManager.createOrMarkRock` scours the ground effects on any tile where rock is raised.
- **`clearResistant`:** a flag on the effect type's gameplay def (`game/terrainEffects/terrainEffectDefs.ts`). A resistant effect survives every clear, including `blast`. Nothing sets it yet.
- **Event:** `terrain_effects_cleared` on the EventBus carries what was cleared and the source, as the hook for visuals.
- **Verbose perf flag:** clear timings are verbose-level measurements. They record only while JS performance tracking is on and `PERFORMANCE_LOG_LEVEL` in `game/performance/tickPerformanceTracker.ts` is `'verbose'`.

Authoring workflow and registration checklist: `card_defs/SKILL.md` and the **creating-an-ability** skill.
