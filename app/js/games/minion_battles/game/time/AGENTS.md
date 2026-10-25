# Time dilation (`game/time/`)

Deterministic per-actor clocks, world pace and Time Stop. Units and projectiles run on their own **local time** at a **tempo**; focal dilations slow the whole world so the dilated actor looks normal speed; Time Stop freezes the world while exempt actors keep acting. Design record: `docs/plans/time-dilation.md`. Quick entry point: the `time-dilation` skill (`.claude/skills/time-dilation/SKILL.md`). This file is the source of truth.

## Files

| File | Owns |
|---|---|
| `timeConstants.ts` | Clamps, budgets, Time Stop cap, frozen-hit default, `HIT_STOP_DEFAULTS` placeholder. |
| `TimeModifier.ts` | `TimeModifier` shape and pure resolvers (`resolveTempo`, `resolveFocalWorldPaceRequest`). |
| `TimeManager.ts` | Owned by `GameState.timeManager`. World pace rule, active Time Stops, `getStepRate`, JSON. |
| `actorClock.ts` | Unit-side clock: `getActorTempo`, `getActorStepRate`, `getCastElapsed`, `localNow`, `advanceUnitLocalClocks`, `collectUnitFocalRequests`. |
| `stepPieces.ts` | `planStepPieces`: cuts a long step into pieces, enforces the budget, returns `timeDebt`. |
| `*.test.ts` | Unit and engine tests; `clockUsage.guard.test.ts` is the source-scan guard (see Pitfalls). |

Related: `projectiles/ProjectileBuff.ts` (projectile tempo sources), `effects/timeDomain.ts` (effect override), `buffs/TimeDilationBuff.ts` (generic tempo buff + presets).

## Vocabulary

Never say bare "time". Name the clock.

| Term | Meaning | Code |
|---|---|---|
| Tick | One lockstep step. Always +1. Orders, networking, fingerprints, AI cadence. | `engine.gameTick` |
| Wall time | Real seconds the player experiences; render loop only. | `realDt` |
| Tick time | `gameTick x FIXED_DT`. Advances even during Time Stop. | `engine.tickTime` |
| World time | Reference clock for undilated things. | `engine.gameTime` (advances by `worldPace x FIXED_DT`) |
| Local time | Time an actor has experienced. | `unit.localTime`, `projectile.localTime` |
| Tempo | Actor local-time rate vs world time; product of modifiers, clamped; 0 only when frozen. | `getActorTempo`, `resolveTempo` |
| World pace | World seconds per tick / `FIXED_DT`. 1 normal, 0.5 slow-mo, 0 Time Stop. | `engine.worldPace` |
| Focal dilation | Tempo modifier that also asks the world to slow so the actor looks normal speed. | `TimeModifier.focal` |
| Local dilation | Tempo modifier with no `focal`; world pace unaffected. | `TimeModifier` |
| Time Stop | World pace 0 for a tick-time duration; exempt actors keep their own rate. | `engine.startTimeStop` |
| Step pieces | Sub-intervals one actor's long step is cut into. | `planStepPieces` |

## Core rules

- **Actor step per tick** = `timeManager.getStepRate(actor, tempo) x FIXED_DT` local seconds (`worldPace x tempo`). Time-Stop-exempt actors use `exemptRate x tempo` and ignore world pace.
- **World pace** = min over active focal requests, clamped to `[WORLD_PACE_MIN, 1]`; 1 with none; 0 during any Time Stop. A focal modifier's default request is `1 / tempo` (actor steps exactly one `FIXED_DT`); an explicit `focal.worldPace` overrides it.
- **Tempo** multiplies across modifiers, then clamps to `[TEMPO_MIN, TEMPO_MAX]`. 0 comes only from Time Stop or a `freeze` modifier.
- **Inheritance:** projectiles and summons start at tempo 1 and never inherit the caster's tempo. Anything driven by the caster's ability timeline follows the caster's clock automatically.
- **Pace-1 invariance (the safety net).** With no modifiers every step is exactly `FIXED_DT` and `gameTime` advances exactly as before. Only multiply when pace is not 1; mix pace/Time Stops into JSON and fingerprints only when non-default. Existing tests must keep their expectations; if one needs new numbers, that is a regression, not a test to update.
- Tick rate in wall time never changes, so BattleNet needs nothing for dilation.

## Which clock do I use?

Walk the list top to bottom for any new time read.

1. **Is it part of a cast (timeline elapsed, interval, gate, held projectile, channel, cast-attached emitter/beam, dash/lunge, echo delay)?** Local time of the caster. Read `getCastElapsed(unit, active, engine)`; for per-step cadence use `ctx.localDt`, not tick counts.
2. **Is it motion (walking, knockback, forced movement, projectile flight/lifetime)?** Local time of that actor. Run it on the piece dt it is handed.
3. **Is it a buff that represents motion (e.g. `LiftedBuff`)?** `clock: 'owner'`, so duration follows the holder's local time and stores while frozen.
4. **Is it an undilated gameplay duration (buff duration, DoT interval, regen, uses/cooldowns, discard timers, spawns, iFrames, round timer, terrain expiry, lighting decay)?** World time: `engine.gameTime` or the world dt passed in.
5. **Is it a cadence that must stay lockstep (AI think rate, group manager, light grid, orders, fingerprints)?** Ticks (`gameTick`). When world pace drops, AI thinks more often per world second; that is intended.
6. **Is it purely visual (sprite animation, particles, effects)?** Wall time (default). Opt in to `timeDomain: 'world' | 'owner'` only when the visual must follow tempo.
7. **Need a duration that survives Time Stop (cinematic, the stop itself)?** Tick time.

Never count ticks for a gameplay duration, and never compute cast elapsed from `engine.gameTime`.

## Step pieces, budget and time debt

- One actor's step is `stepRate x FIXED_DT`. A step of at most `FIXED_DT` with no debt is **one piece**: the exact single call as today, just a smaller `dt` (slowed actors move every tick by less, so nothing stutters).
- Longer steps (tempo above 1, explicit focal pace) are cut by `planStepPieces` at ability timeline boundaries (`collectAbilityBoundaryOffsets` in `unitAbilityTick`) and at `MAX_PIECE_TRAVEL_PX` of travel. Cost scales with what the actor does (a standing unit at 100x is about one piece), not with tempo.
- `MAX_STEP_PIECES_PER_TICK` bounds the worst case. Leftover local time becomes `timeDebt`, carried to the next tick: deterministic, and the actor briefly lags its true rate.
- **Units:** `UnitManager.gameTick` runs piece 0 in the normal phases and pieces 1.. (ability, then movement) right after the movement phase, with `unit.localTime` / `localStep` pointed at each piece. Occupancy, pathfinding, crowd spacing and AI run once per tick. Passives, resource `onTick` and buff upkeep (`tickUnitUpkeep`, also for frozen units) run once per tick on world dt.
- **Projectiles:** `ProjectileManager.update(timeManager)` calls `Projectile.advance(stepDt, ctx)`; wall stop and unit collision run per piece; held time runs on piece dt.
- **Advancing local time:** `advanceUnitLocalClocks` runs in `fixedUpdate` right after `gameTime` increments, before orders apply. The clock starts lazily at `prevGameTime` so at pace 1 / tempo 1 `localTime` equals `gameTime` bit for bit; before it starts, `localNow` falls back to world time (stub engines, spawn tick).

## Adding a tempo source

- **Unit buff:** set `Buff.timeModifier` (`tempo`, optional `focal`, optional `freeze`). `getActorTempo` multiplies all of a unit's buff modifiers; `collectUnitFocalRequests` feeds focal ones into world pace. Prefer the generic `TimeDilationBuff` (`applyTimeDilationBuff` refreshes same-source) and add a named preset to `TIME_DILATION_PRESETS` rather than a bespoke buff. Ease Burdens (0906) is the reference user and contains no tempo logic.
- **Buff clock:** `Buff.clock` is `'world'` by default. Use `'owner'` only for buffs that represent motion; `Unit.addBuff` stamps `appliedAtTime` with local time and `isExpired` takes the owner local time.
- **Projectile:** `proj.addBuff({ sourceId, appliedAtTime, duration (WORLD seconds or null), timeModifier? })`, `removeBuffsFromSource`, `expireBuffs(gameTime)`, `getTempo()`. The list is generic so non-time projectile buffs can join it. Serialized only when non-empty.
- **Focal with explicit world pace:** give the modifier `focal: { worldPace }` (e.g. self 1.5x, world 0.75x). The actor then takes more than `FIXED_DT` per tick and its step is split into pieces. Without `worldPace`, the request is `1 / tempo`.
- **Local dilation** (a slow field's debuff): omit `focal`.
- Do not put tempo logic in ability code. Abilities apply the buff; faster movement and cast phases come from the engine.

## Time Stop and frozen-hit policy

- Single entry point: `engine.startTimeStop({ sourceActorId?, durationTickSeconds, exemptActorIds?, exemptRate?, frozenHitPolicy? })`; `engine.endTimeStop(id)` ends early. Duration is tick-time and clamped to `MAX_TIME_STOP_TICK_SECONDS`, so nothing freezes the world indefinitely; an expired stop restores pace on the same tick.
- Exempt actors step at `exemptRate x tempo`; their ability timelines advance as authored (an exempt caster keeps casting). A cinematic-only stop has no exempt actors.
- Events: `time_stop_started`, `time_stop_ended` (`reason: 'expired' | 'ended'`), `world_pace_changed { previousPace, worldPace, gameTick }`. Use them for VFX/UI instead of polling.
- **Frozen-hit policy precedence:** the Time Stop def's `frozenHitPolicy` beats `DamageApplyOptions.frozenHitPolicy` beats `DEFAULT_FROZEN_HIT_POLICY` (`'immediate'`). `'immediate'` applies as normal; `'onResume'` queues `unit.pendingFrozenHits` (serialized), resolved in order at the start of the first `UnitManager.gameTick` after the unit thaws (after thaw, before abilities).
- Hit-stop is a placeholder: `HIT_STOP_DEFAULTS` documents the intended design (short tick-time `freeze` modifier on attacker and victim, not world pace); `requestHitPause` is a no-op.

## Frozen actors (tempo 0)

- `unit.localFrozen` is set by `advanceUnitLocalClocks`. Frozen units: **take damage and can die** (immediate hits); skip ability, movement and knockback pieces; **store** knockback/forced-movement momentum (no local time passes) and release it on thaw; run no AI; are **never parallel-order waiters** (`OrderManager.collectParallelWaiters`); **hold orders** (`applyOrderLogic` re-queues them for the next tick until the unit thaws, deterministic order kept).
- Buff upkeep still runs on world dt for frozen units; `'owner'`-clock buffs (lift arcs) do not progress.
- Frozen projectiles are skipped entirely: no move, no held time.

## Effects: `timeDomain`

Effects, sprite animations and particles ignore tempo and world pace by default (`'wall'`). Opt in with `timeDomain: 'world' | 'owner'` on effect/emitter defs. Details and API: `game/effects/AGENTS.md` ("timeDomain"). Audio is untouched.

## Owner-clock site list (migrated)

Cast elapsed / timeline (local): `unitAbilityTick`, `unitAbilityLifecycle` (start, interrupt, fizzle, skip-to-cooldown), `unitAbilityQueries` (speed penalty, iFrames, juggernaut, entomb, conditional-cancel refund), `selectTargetLookahead`, `GameEngine` coop-cooldown cancel, `OrderManager` conditional-cancel refund, `blockingHelpers`, `AbilityEventRuntime`, `BattleTimeline`, `UnitRenderer` caster offset, `PreviewRenderer`, and the `renderActivePreview` bodies in `shieldHelpers`, `ChargeAttack`, `MultiChargeAttack` and cards 0001 0002 0004 0008 0010 0016 0018 0020 0530 0536 0537 0702 0705 0706 0707 0905. `renderActivePreview` receives the caster's local "now" in its `gameTime` argument; use `getCastElapsedAt(active, gameTime)`. `isPreviewCastInstance` compares local stamps (`beganAtLocalTime`), falling back to `beganAtGameTime`.

Cadence: `DashBehaviour` afterimages (`ctx.localDt`), `mirrorToClones` echo delay (scaled by the caster's step rate), `LiftedBuff` duration/render progress.

### Reviewed and left on the world clock

Buff durations (default), DoTs, regen, passives (`passiveRunner`), uses/cooldowns/discard, spawns, `ephemeralDespawnAtGameTime`, thorn/bramble expiry (`terrainLayers`), round-interval gates (`LightEater`/`PhantomDecoy` `canUse`), pet `heelUntilGameTime`, all `unitAI/**` timers (tick cadence), `Unit.wait*EndTime`, `CasterShakeBehaviour` (visual only), `tryApplyHardCcStun` (stun is a buff).

## Pitfalls

- Never compute cast elapsed from `engine.gameTime`. `clockUsage.guard.test.ts` scans `abilities/**` and `card_defs/**` for `gameTime - ...startTime/castStartTime` and fails with a pointer to `getCastElapsed`.
- Never count ticks for gameplay durations; use the right clock from the decision list.
- Tick-cadence systems (AI, group manager, light grid) are intentionally not dilated.
- `ActiveAbility.startTime` is a **local-time** stamp; do not compare it with world time.
- Do not give projectiles/summons the caster's tempo; they start at 1.
- Do not widen the fast path: a step of at most `FIXED_DT` must stay a single call, or pace-1 tests drift.
- New serialized time state must be omitted at defaults so pace-1 JSON and fingerprints stay byte-identical.
- Previews (ITS, ghost plans, play-ahead) run the same dilated engine path; ability-duration-to-ticks math takes the caster's step rate (`abilityDurationSecondsToTicks(sec, stepRate)`), tick caps stay in ticks.
- Tests: Time Dilation AbilityTest section (`testing/scenarios/general/timeDilation.ts`), plus `*.test.ts` here.

## Known limitations

- **Dash/lunge movement is only cut at ability boundaries.** Ability dashes/lunges own the body in `unitMovementTick`; at very high tempo they are not travel-split, so they can cover more than `MAX_PIECE_TRAVEL_PX` per piece between boundaries. Walking and knockback are travel-split.
- **Select-target lookahead is unaware of multi-piece windows.** `selectTargetLookahead` projects per-unit local time for one step; it does not model a tick that splits into several pieces.
- **A Time Stop or `'onResume'` hit landing mid-tick takes effect next tick.** Units freeze (`localFrozen`) from the following tick, and queued hits resolve at the next tick start.
- **Projectile focal modifiers are not fed into world pace.** `collectFocalRequests` gathers unit buffs only (`collectUnitFocalRequests`); a `focal` on a `ProjectileBuff` slows that projectile's tempo but never the world.
- **`BattleTimeline.tsx` wait lockout mixes clocks.** The wait-lockout branch computes elapsed as cast-second duration minus `(waitMaxEndTime - engine.gameTime)`, mixing a world-clock end time with cast-second intervals; the displayed lockout is off for a dilated waiter.
