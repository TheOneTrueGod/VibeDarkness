# Time Dilation system + Ease Burdens (0906) — Implementation Plan

Adds a deterministic **time dilation** engine system to Minion Battles. Actors (units, projectiles) run on their own clocks at a **tempo** relative to world time. **Focal** dilations slow the whole world so the dilated actor looks normal speed, and an explicit **Time Stop** freezes the world while exempt actors keep acting. The first content user is **Ease Burdens** (0906), a Gravity-tree ally haste.

## Agent Instructions

This plan is executed by `/jp-implement-plan docs/plans/time-dilation.md`. The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously** (never in the background), waits for each to finish, then reports plan completion to the user. Each worker implements exactly one step, checks its items off with a one-line summary, and **stops without spawning the next agent**. See `.claude/skills/jp-implement-plan/SKILL.md` for the workflow — do not restate it here.

Relevant project skills: `working-on-minion-battles`, `game-engine`, `game-object-def-pattern`, `creating-an-ability`, `editing-card-behaviour`, `research-trees`, `ability-tests`, `scoped-testing`, `game-sync-data-flow` (determinism / checkpoint round-trip only — BattleNet should need **no** changes), `working-with-todos`, `writing-nested-agents-files`, `working-with-skills`.

Rules for every worker:

- Read "Build the engine, not the feature" in `app/js/games/minion_battles/AGENTS.md` first. Everything here is engine work: properties on defs/instances, one entry point per system, EventBus events for side effects.
- **Pace-1 invariance is the safety net.** With no time modifiers active, every actor's step must be exactly `FIXED_DT` and `gameTime` must advance exactly as today. Existing tests must keep passing with **unchanged expectations**. If an existing test needs its numbers changed, stop and report it — that is a behaviour regression, not a test to update.
- New state must round-trip `toJSON`/`fromJSON` and behave identically in ITS preview and committed runs.
- Do not touch `game/battlenet/**`. The tick rate in wall time (60 ticks/s) does not change, so network pacing is unaffected.
- Paths below are relative to `app/js/games/minion_battles/` unless they start with `app/` or `docs/`.
- Per-step verification is limited to `npm run lint`, `npx tsc --noEmit` (most steps cross interfaces, so run it), and **only the test files the step creates or touches**, plus any extra file named in the step. Never run the full suite or AbilityTests in a regular step.
- Vitest, not Jest.

---

## Locked design

### Vocabulary

Use these names in code, comments and docs. Never use a bare "time" where the clock is ambiguous.

| Term | Meaning | Code |
|---|---|---|
| **Tick** | One lockstep step. Always advances by 1. Drives orders, networking, fingerprints, AI cadence. | `engine.gameTick` (unchanged) |
| **Wall time** | Real seconds the player experiences. Only the render loop sees it. | `realDt` in `loop` / `doRenderTick` |
| **Tick time** | `gameTick × FIXED_DT`. Always advances, even during Time Stop. Used for Time Stop durations and cinematics. | `engine.tickTime` (new, derived) |
| **World time** | The reference clock for undilated things: round timer, buffs, DoTs, regen, cooldowns/uses, level events, spawns, iFrames. | `engine.gameTime` (unchanged name; now advances by `worldPace × FIXED_DT`) |
| **Local time** | Time an actor has experienced. Ability timelines, movement, knockback, projectile flight and lifetime. | `actor.localTime` (new) |
| **Tempo** | Actor's local-time rate relative to world time. Product of its modifiers, clamped to `[TEMPO_MIN, TEMPO_MAX]`. 0 only while frozen. | `getActorTempo(actor)` |
| **World pace** | World seconds per tick ÷ `FIXED_DT`. 1 = normal; 0.5 = slow-mo; 0 = Time Stop. | `engine.worldPace` (new) |
| **Focal dilation** | A tempo modifier that also asks the world to slow so this actor looks normal speed. | `TimeModifier.focal` |
| **Local dilation** | A tempo modifier that does not affect world pace (e.g. a slow field's debuff). | `TimeModifier` without `focal` |
| **Time Stop** | World pace 0 for a tick-time duration, with exempt actors that keep their own rate. | `engine.timeManager.startTimeStop(...)` |
| **Step pieces** | The sub-intervals one actor's step is cut into when it is long, split at events and at a max travel distance. | `planStepPieces(...)` |

### Rules

- **Actor step per tick** = `worldPace × tempo × FIXED_DT` (local seconds). Time-Stop-exempt actors use `exemptRate × tempo × FIXED_DT` instead, ignoring world pace.
- **World pace** = `min` over all active focal requests, clamped to `[WORLD_PACE_MIN, 1]`; 1 when there are none; 0 while any Time Stop is active.
  - A focal modifier's default request is `worldPace = 1 / tempo`, so the actor's per-tick step is exactly one `FIXED_DT` (it looks normal speed).
  - A focal modifier may instead give an explicit `worldPace` (e.g. self 1.5×, world 0.75×). The actor then takes more than `FIXED_DT` per tick and its step is split into pieces.
- **Clamps:** `TEMPO_MIN = 0.01`, `TEMPO_MAX = 100`, `WORLD_PACE_MIN = 0.01`. Tempo 0 is reachable only through Time Stop or an explicit freeze modifier.
- **Stacking:** tempo modifiers multiply.
- **Step splitting (no fixed sub-step cap):** an actor's step is cut into pieces at:
  1. ability timeline boundaries (interval starts/ends, gates, interval fires) inside the step window;
  2. a max travel distance per piece (`MAX_PIECE_TRAVEL_PX`, about half a tile) for movement, knockback and projectile flight.

  Cost scales with what the actor does, not with tempo. A per-actor per-tick budget `MAX_STEP_PIECES_PER_TICK` (64) bounds the worst case. Leftover local time is carried as `timeDebt` to the next tick (deterministic; the actor briefly runs behind its true rate).
- **Step ≤ `FIXED_DT` (the common case):** one piece, same code path as today with a smaller `dt`. Slowed actors move every tick by a smaller amount, so nothing stutters.
- **Clocks by system:**
  - **World time:** buff durations, DoT intervals, resource regen, ability uses/cooldowns, discard duration, round timer, iFrames.
  - **Local time:** ability timelines and everything they drive (held projectiles, channels, cast-attached emitters, beams), movement, knockback/forced movement, projectile flight/lifetime/held time.
  - **Tick cadence:** AI think-rate stays on engine ticks. When world pace drops, AI thinks more often per world second. That is intended.
  - **Buffs that represent motion** (e.g. `LiftedBuff`) opt into `clock: 'owner'` so their duration follows the unit's local time. The default is `'world'`.
- **Inheritance:** projectiles and summons start at tempo 1 with their own modifier lists; they do **not** inherit the caster's tempo. Things driven by the caster's ability timeline follow the caster's clock automatically, because the timeline does.
- **Frozen actors (tempo 0):**
  - take damage and can die;
  - knockback/forced-movement momentum is stored (no local time passes) and released on resume;
  - no AI, never a parallel-order waiter;
  - orders addressed to them are held until they resume;
  - hits on them follow the frozen-hit policy: `'immediate'` (engine default) or `'onResume'` (queued, resolved in order when the actor's tempo becomes > 0). Time Stop defs (and a per-hit option) may override the policy.
- **Freeze guards:** every Time Stop has a tick-time duration, clamped to `MAX_TIME_STOP_TICK_SECONDS` (default 5). Nothing can freeze the world indefinitely. An expired Time Stop restores pace on the same tick.
- **Effects ignore tempo by default.** Visual effects, sprite animations and particles keep their normal speed and lifetime regardless of tempo or world pace. They need an opt-in override `timeDomain: 'wall' | 'world' | 'owner'` (default `'wall'`). Audio is untouched.
- **Hit-stop:** placeholder only. Ship documented defaults; `requestHitPause` stays a no-op.
- **Fingerprint:** mix world pace and active Time Stops into the runtime fingerprint only when they differ from the defaults, so pace-1 fingerprints are byte-identical to today.

### Ease Burdens (card `0906`, group 09)

| Aspect | Decision |
|---|---|
| Name | **Ease Burdens** (research node id `gravity_ease_burdens`) |
| Target | Any allied unit, including self |
| Effect | Applies a **focal** tempo buff: tempo 2, duration **3 s world time**. The ally gets 6 s of local time in 3 s of world time; world pace drops to 0.5 while it lasts. |
| Behaviour | Faster movement, cast phases, etc. all come from the engine system, **not** from ability code. The ability only applies the buff. |
| Cost | **2** Gravity energy |
| Uses | **1** per round |
| Research | Tier **13**, requires `gravity_core`. Sibling of Gravity Shield. Adjust tree node positions so the layout reads cleanly. |
| Buff | A generic, reusable **`TimeDilationBuff`** (tempo, focal, optional explicit world pace, duration), not an Ease-Burdens-specific buff. Ease Burdens uses a named preset (e.g. `TIME_DILATION_PRESETS.focalHaste2x`). |

---

## Steps

### Step 1 — Time core module, vocabulary, constants, hit-stop placeholder

Files (expected): new `game/time/timeConstants.ts`, `game/time/TimeModifier.ts`, `game/time/TimeManager.ts`, `game/time/TimeManager.test.ts`, `game/time/AGENTS.md`, `game/time/index.ts`; `game/GameEngine.ts` (hit-stop comment only).

- [x] Add `timeConstants.ts` with `TEMPO_MIN = 0.01`, `TEMPO_MAX = 100`, `WORLD_PACE_MIN = 0.01`, `MAX_TIME_STOP_TICK_SECONDS = 5`, `MAX_STEP_PIECES_PER_TICK = 64`, `MAX_PIECE_TRAVEL_PX` (about half a tile; derive from the tile size constant), `DEFAULT_FROZEN_HIT_POLICY = 'immediate'`.
    Done: `game/time/timeConstants.ts` has all constants plus `FrozenHitPolicy` and `DEFAULT_FROZEN_HIT_POLICY`.
- [x] Add `TimeModifier` (`{ sourceId, tempo, focal?: { worldPace?: number }, freeze?: boolean }`), plus pure helpers:
    Done: `TimeModifier.ts` with `resolveTempo` / `resolveFocalWorldPaceRequest` (clamped to `[WORLD_PACE_MIN, 1]`); tested in `TimeManager.test.ts`.
    - `resolveTempo(modifiers)`: multiply, then clamp; `freeze` gives 0.
    - `resolveFocalWorldPaceRequest(modifier)`: default `1 / tempo`.
    - Unit tests: stacking, clamps, freeze, explicit focal pace.
- [x] Add `TimeManager` (owned by `GameState`) holding `worldPace`, active Time Stops (`{ id, sourceActorId, startTick, durationTicks, exemptActorIds, exemptRate, frozenHitPolicy }`) and the `computeWorldPace(focalRequests)` rule. Add `startTimeStop` / `endTimeStop` as the single entry points (clamp duration to `MAX_TIME_STOP_TICK_SECONDS`), `getStepRate(actor)` returning the per-tick multiplier of `FIXED_DT`, and `toJSON`/`fromJSON`.
    Done: `TimeManager` (`startTimeStop(spec, currentTick)`, `endTimeStop`, `resolveWorldPace(focalRequests, tickToRun)`, `getStepRate(actor, tempo = 1)`, `restoreFromJSON`/`toJSON`) plus pure `computeWorldPace`; owned by `GameState.timeManager`.
    - Unit tests: no modifiers → pace 1; two focal hastes take the min; Time Stop → 0 and expires by tick time; duration clamp; JSON round-trip.
- [x] Write a starter `game/time/AGENTS.md` (vocabulary table, clock-by-system rules, pace-1 invariance rule) so later workers share the terms. Step 11 expands it into the full guide.
    Done: Starter `game/time/AGENTS.md` written (vocabulary, clock-by-system, pace-1 rule).
- [x] Hit-stop placeholder: add `HIT_STOP_DEFAULTS` (e.g. `{ ticks: 3, appliesTo: 'attackerAndVictim', mechanism: 'freezeModifier' }`) in `timeConstants.ts`. Comment that a future implementation applies a short tick-time `freeze` `TimeModifier` to attacker and victim (not world pace), so the rest of the world keeps moving and stored momentum resumes afterwards. Update the `requestHitPause` doc comment in `GameEngine.ts` to point at it. Keep it a no-op.
    Done: `HIT_STOP_DEFAULTS` added; `requestHitPause` doc points at it and stays a no-op.

### Step 2 — Engine tick integration (world pace, tick time, serialization)

Files (expected): `game/GameEngine.ts`, `game/GameState.ts`, `game/EngineContext.ts`, `abilities/AbilityEngineContext.ts` (if it mirrors engine fields), `game/Fingerprint.ts` (event key only, if needed), `game/GameEngine.test.ts` (or new `game/time/engineTimeIntegration.test.ts`).

- [x] In `fixedUpdate`, resolve world pace at the start of the tick (from Time Stops + focal requests gathered from actors through a `collectFocalRequests()` hook that returns `[]` until Step 3 wires buffs into it), then advance `gameTime += worldPace × FIXED_DT`. Expose `engine.worldPace` and `engine.tickTime` on `EngineContext`.
    Done: `fixedUpdate` resolves pace via `timeManager.resolveWorldPace(this.collectFocalRequests(), gameTick + 1)` (hook returns `[]`); `gameTime += worldDt` (`worldDt === dt` exactly at pace 1); `engine.worldPace`/`engine.tickTime`/`engine.timeManager` exposed, `EngineContext` has `worldPace`/`tickTime`.
- [x] Pass world dt (`worldPace × FIXED_DT`) to world-clock systems: round progress, DoTs, level events, lighting decay, nests, darkness corruption, terrain layer expiry. Keep tick-cadence systems (`LIGHT_TICK_INTERVAL`, `everyAITicks`, group manager) on `gameTick`.
    Done: World dt goes to unitManager.gameTick (interim until Step 5), projectiles (interim until Step 6), darkness corruption, light source decay, nests, select-target lookahead; effects/emitters stay on wall `dt`; AI/group/light-grid cadence stays on `gameTick`. Audit is a comment block in `fixedUpdate`.
    - Audit every `dt` use in `fixedUpdate` and record each as world or tick in a comment block.
- [x] Serialize `TimeManager` through engine/`GameState` `toJSON`/`fromJSON`. Mix pace and Time Stops into the runtime fingerprint only when non-default.
    Done: `timeManager` serialized in `SerializedGameState` only when non-default; new `FingerprintEvent.TIME_STATE` mixed only when non-default.
- [x] Tests:
    Done: `game/time/engineTimeIntegration.test.ts` covers pace-1 exactness, pace 0.5, Time Stop hold and mid-stop round-trip; lockstepDeterminism/replayRoundTrip/GameEngine/Fingerprint/tickStateHistory pass unchanged.
    - with no modifiers, `gameTime` after N ticks equals today's value exactly;
    - a forced pace of 0.5 halves `gameTime` advance while `gameTick` and `tickTime` advance normally;
    - Time Stop holds `gameTime` and the round timer;
    - a checkpoint round-trip mid-Time-Stop resumes identically.
    - Also run `game/lockstepDeterminism.test.ts` and `game/replayRoundTrip.test.ts` unchanged.

### Step 3 — Unit local clock, tempo from buffs, ability timeline on local time

Files (expected): `game/units/Unit.ts`, `game/units/unitToJSON.ts`, `game/units/unitFromJSON.ts`, `game/units/unitTypes.ts`, `buffs/Buff.ts`, `buffs/LiftedBuff.ts`, new `game/time/actorClock.ts`, `game/units/unitAbilityTick.ts`, `game/units/unitAbilityLifecycle.ts`, `game/units/unitAbilityQueries.ts`, new `game/time/actorClock.test.ts`.

- [x] Add `unit.localTime` (serialized) and `unit.timeDebt`. Add `actorClock.ts` with `getActorTempo(actor, engine)` (modifiers from buffs × engine freeze/exempt state) and `getCastElapsed(unit, active)` = `unit.localTime - active.startTime`.
    Done: `unit.localTime`/`localClockActive`/`localStep`/`timeDebt` (serialized only when active/non-zero); `actorClock.ts` has `getActorTempo`, `getActorStepRate`, `getCastElapsed`, `localNow`, `advanceUnitLocalClocks`, `collectUnitFocalRequests`; engine `collectFocalRequests` wired.
- [x] Add `Buff` properties (def-pattern, defaults off): `timeModifier?: TimeModifier` (tempo/focal/freeze carried by a buff) and `clock: 'world' | 'owner'` (default `'world'`). `isExpired` uses the owner's local time when `clock === 'owner'`. Set `LiftedBuff` to `'owner'` so lift arcs store momentum while frozen.
    Done: `Buff.clock` / `Buff.timeModifier` (+ `isExpired(..., ownerLocalTime)`), `Unit.addBuff` stamps local time for owner buffs, `LiftedBuff` is `'owner'`, `unitMovementTick` passes the owner local time.
- [x] Make `ActiveAbility.startTime` a **local-time** timestamp: set from `unit.localTime` at cast start. Replace `engine.gameTime - active.startTime` in `unitAbilityTick.ts`, `unitAbilityLifecycle.ts` and `unitAbilityQueries.ts` with `getCastElapsed`. `computeTickElapsed` takes the unit's local time and the step dt.
    - Leave a clear comment on `ActiveAbility.startTime` that it is in **local time**.
    Done: `startTime` stamped via `localNow` at cast start; tick/lifecycle/queries use `getCastElapsed`/`localNow`; `tickUnitActiveAbilities` uses `unit.localStep`; `selectTargetLookahead` projects per-unit local time; `ActiveAbility.startTime` documented as local time.
- [x] Tests: tempo-2 unit's cast reaches its end in half the world time; tempo-1 behaviour unchanged; owner-clock buff expiry follows local time; JSON round-trip of `localTime`/`timeDebt`.
    Done: `game/time/actorClock.test.ts` (9 tests) covers all four.

### Step 4 — Migrate remaining ability-timeline time reads to the caster's clock

Files (expected): every non-test file that reads cast elapsed time from the world clock. Find them with `grep -rnE "gameTime ?- ?[a-zA-Z.]*(startTime|castStartTime)"` and `grep -rn "castStartTime"`; about 35 files in `abilities/CastBehaviours/**`, `abilities/**`, `card_defs/**`. Plus new `game/time/clockUsage.guard.test.ts`.

- [x] Replace every world-clock cast-elapsed read with `getCastElapsed` (or the local-time value already passed in the ability context). Ability-context fields named `gameTime` that are used as "cast now" should gain a `casterLocalTime` sibling rather than changing meaning silently.
    Done: Cast-elapsed reads use `getCastElapsed(unit, active, engine)`; `renderActivePreview`'s `gameTime` arg is now the caster local "now" (`getCastElapsedAt`), documented on `AbilityStatic`; ~18 ability/card files, blockingHelpers, AbilityEventRuntime, OrderManager, GameEngine, renderers, BattleTimeline migrated.
- [x] Review the remaining `engine.gameTime` comparisons (about 117 sites, 58 files) and classify each as **world** (leave) or **owner** (migrate). Record the owner-clock list in `game/time/AGENTS.md` (Step 11 folds it into the full guide). Expected owner-clock: held-projectile timing driven by casts, cast-attached emitters and beams, dash/lunge timing, `DashBehaviour` afterimage cadence (`everyNTicks` → local-time interval), `mirrorToClones.delayTicks`.
    Done: Classification and owner-clock site list appended to `game/time/AGENTS.md`; dash afterimages use `ctx.localDt`, `mirrorToClones` delay scales by caster step rate. Projectile/emitter sites left to Steps 6/8.
- [x] Add a guard test that scans `abilities/**` and `card_defs/**` source text and fails on `gameTime - ...startTime` / `gameTime - ...castStartTime` patterns, with a message pointing at `getCastElapsed`.
    Done: `game/time/clockUsage.guard.test.ts` (import.meta.glob raw scan of `abilities/**` + `card_defs/**`) fails on `gameTime - ...startTime/castStartTime`.
- [x] Run the co-located `NNNNAbility.test.ts` files for every card touched, plus the guard test. These are pace-1 runs, so expectations must not change.
    Done: Ran 16 touched cards' co-located tests plus abilities/CastBehaviours/displacer/interaction/LiftedBuff/GameEngine/replayRoundTrip suites and the guard; all pass with unchanged expectations.

### Step 5 — Unit step pieces (event split + travel split + budget) and frozen-unit rules

Files (expected): `game/managers/UnitManager.ts`, new `game/time/stepPieces.ts`, `game/units/unitAbilityTick.ts` (next-boundary query), `game/units/unitMovementTick.ts`, `game/units/unitKnockback.ts`, `game/managers/OrderManager.ts`, new `game/time/stepPieces.test.ts`, new `game/time/unitTempo.test.ts`.

- [x] Add `planStepPieces({ stepDt, nextEventIn, maxTravelPx, speedPx, budget })`. It returns piece dts that never exceed `FIXED_DT`-equivalent travel, are cut at the next ability boundary, stop at the budget, and leave the remainder as `timeDebt`. Expose a "next timeline boundary after elapsed X" query from `unitAbilityTick` (reuse the interval/gate data `findSelectGateSplit` already uses).
    - Tests: 3.1415× and 100× produce deterministic piece lists; a still unit at 100× costs ~1 piece; the budget carries debt.
    Done: `game/time/stepPieces.ts` (`planStepPieces` -> `{ pieces, debt }`, `isSinglePieceStep`) + `stepPieces.test.ts`; `collectAbilityBoundaryOffsets` in `unitAbilityTick` is the boundary query.
- [x] In `UnitManager.gameTick`, compute each unit's step (`TimeManager.getStepRate × FIXED_DT`, plus debt) and advance `unit.localTime` piece by piece:
    - Per piece: active abilities → movement/knockback, in today's phase order.
    - Global phases (occupancy rebuild, pathfinding, crowd spacing) run once per tick as today.
    - Passives and resource `onTick` use **world dt** (world-clock systems).
    - AI stays once per tick on tick cadence.
    - When step ≤ `FIXED_DT` and there is no debt, the path must be the same single call as today.
    Done: `UnitManager.planUnitSteps` builds plans only for long/indebted units; piece 0 runs in the normal phases, pieces 1.. right after movement; buff upkeep (`tickUnitUpkeep`) once per tick on world dt; single-piece path unchanged.
- [x] Frozen units (tempo 0): skip ability/movement/knockback pieces and AI. `OrderManager.collectParallelWaiters` excludes them. Orders whose unit is frozen at apply time stay pending and apply on the first tick the unit's tempo is > 0 (deterministic order kept).
    Done: `unit.localFrozen` skips abilities/movement/knockback/AI (upkeep still runs); `collectParallelWaiters` excludes frozen units; `applyOrderLogic` re-queues orders for the next tick while frozen.
- [x] Tests:
    Done: `game/time/unitTempo.test.ts` (9 tests) covers all four bullets plus boundary splitting, the piece budget and held orders.
    - tempo-2 unit walks twice the distance of a tempo-1 unit in the same world time;
    - a 100× unit walking a path into a wall stops at the wall (no tunnelling);
    - a frozen unit's knockback resumes with the same remaining arc after unfreezing;
    - frozen units are not parallel waiters.

### Step 6 — Projectile buff list, projectile local clock and pieces

Files (expected): new `game/projectiles/ProjectileBuff.ts`, `game/projectiles/Projectile.ts`, `game/managers/ProjectileManager.ts`, projectile `toJSON`/`fromJSON` site(s), new `game/projectiles/projectileTempo.test.ts`.

- [x] Add a lightweight `ProjectileBuff` list on `Projectile`: `{ id, sourceId, appliedAtTime, duration (world seconds), timeModifier? }`, serialized, with `addBuff` / `removeBuffsFromSource` / expiry against world time. Keep it generic so later features can add non-time projectile buffs. Document it in `game/time/AGENTS.md` and the projectile folder's docs.
    Done: `ProjectileBuff.ts` + `Projectile.addBuff/removeBuffsFromSource/expireBuffs/getTempo`; buffs serialized only when non-empty; documented in `game/time/AGENTS.md` (Projectiles).
- [x] Projectile `localTime`; `update` takes the projectile's step from `TimeManager`. Long steps are split by `MAX_PIECE_TRAVEL_PX`; `findWallStop` and unit collision run per piece. Held time, lifetime and range timers use local time. Projectiles start at tempo 1 regardless of caster.
    Done: `ProjectileManager.update(timeManager)` steps each projectile via `Projectile.advance` (single piece when step <= FIXED_DT; travel-split pieces otherwise; budget leftovers in `timeDebt`); held time on piece dt; frozen skipped.
- [x] Tests:
    Done: `projectileTempo.test.ts` (10 tests) covers all four bullets plus pace-1 exactness, debt and held time.
    - a 0.5-tempo projectile covers the same total distance in twice the world time;
    - a 50× projectile still stops at walls and hits the first unit in its line;
    - frozen projectiles do not move;
    - buff JSON round-trip.

### Step 7 — Time Stop entry point, frozen-hit policy, events

Files (expected): `game/time/TimeManager.ts`, `game/EventBus.ts` (event types), `game/units/unitDamage.ts`, `game/units/Unit.ts` (pending frozen hits, serialized), `game/units/unitToJSON.ts`/`unitFromJSON.ts`, new `game/time/timeStop.test.ts`.

- [x] Engine entry point `engine.startTimeStop({ sourceActorId, durationTickSeconds, exemptActorIds, exemptRate = 1, frozenHitPolicy? })`.
    - Emits `time_stop_started` / `time_stop_ended` and `world_pace_changed` on the EventBus, for VFX and UI.
    - Exempt actors step at `exemptRate`. Their ability timelines advance or not as authored (an exempt caster's ability keeps running; a cinematic-only stop simply has no exempt actors).
    Done: `engine.startTimeStop(spec)` / `engine.endTimeStop(id)`; events `time_stop_started`, `time_stop_ended` (`reason: 'expired' | 'ended'`), `world_pace_changed { previousPace, worldPace, gameTick }`.
- [x] Frozen-hit policy in `unitDamage`: `'immediate'` applies as today. `'onResume'` queues `{ amount, sourceId, ... }` on the frozen unit (serialized). The queue resolves in order on the first tick its tempo is > 0. Resolution order: Time Stop def → per-hit option → `DEFAULT_FROZEN_HIT_POLICY`. Frozen units can die from immediate hits.
    Done: `resolveFrozenHitPolicy` (stop def > `DamageApplyOptions.frozenHitPolicy` > default), `unit.pendingFrozenHits` serialized, resolved at the start of `UnitManager.gameTick` after thaw.
- [x] Tests:
    Done: `game/time/timeStop.test.ts` (8 tests) covers all five bullets plus early end, per-hit option precedence and lethal queued hits.
    - Time Stop with an exempt caster: the caster's cast advances, enemies don't, `gameTime` is held, and the stop ends on its tick-time duration;
    - immediate hits kill a frozen unit;
    - `'onResume'` hits land on resume;
    - the duration clamp holds;
    - checkpoint round-trip mid-stop.

### Step 8 — Effects time domain override

Files (expected): `game/effects/Effect.ts`, `game/effects/EffectManager.ts`, `game/effects/EffectEmitter.ts`, `game/effects/EffectEmitterManager.ts`, `game/effect_defs/` def type (where the def shape lives), `game/effects/AGENTS.md`, new or existing `game/effects/EffectManager.test.ts`.

- [x] Add `timeDomain?: 'wall' | 'world' | 'owner'` to effect and emitter defs/instances (default `'wall'` = today's behaviour).
    - `EffectManager` `ticksAlive` / `duration × 60` completion stays tick-based for `'wall'`. `'world'` scales elapsed by world pace; `'owner'` by the owner actor's step rate.
    - Replace the hardcoded `* 60` with `/ FIXED_DT` while here.
    - Same for `emitIntervalFrames` cadence.
    Done: `effects/timeDomain.ts` (`resolveTimeDomainRate`); `Effect`/`EffectEmitter` carry `timeDomain` + `ownerActorId`; managers scale dt (wall = exactly 1); torch `ticksAlive` uses `/ FIXED_DT`; `ContinuousEmitter` frame accumulator; `ownerTempoResolver` hook for Step 3; def types + `createEmitterFromDef` pass-through.
- [x] Tests: default effects keep their lifetime at pace 0.5; a `'world'` effect lasts twice as many ticks at pace 0.5; an `'owner'` effect follows its owner's tempo.
    Done: `game/effects/EffectManager.test.ts` (11 tests: effects, torch ticks, interval/continuous emitters, owner tempo hook, JSON).

### Step 9 — Previews (ITS timeline, ghost plans, play-ahead) show dilated timings

Files (expected): `ui/components/itsTimelineMath.ts`, `ui/pages/battlePhase/useInteractiveTargetingProgress.ts`, `ui/pages/battlePhase/useBattleGhostPlans.ts`, `game/GameRenderer/renderers/PreviewRenderer.ts`, `game/interaction/isITSPreviewComplete.ts` (if it compares world time), co-located tests for `itsTimelineMath`.

- [x] Convert ability-duration-to-ticks math to use the unit's current step rate: `abilityDurationSecondsToTicks(sec, stepRate)` = `ceil(sec / (stepRate × FIXED_DT))`. Timeline pips and ghost-plan lengths then show how long a cast takes in ticks at the current pace/tempo. Tick-based caps (`ITS_ENDED_EARLY_PLAYAHEAD_MAX_TICKS`) stay in ticks.
    Done: `abilityDurationSecondsToTicks(sec, stepRate = 1)` (rate 1 is exactly `ceil(sec*60)`); ITSTimelineControls and BattlePhase pass `getActorStepRate(caster, engine)`; tick caps unchanged.
- [x] Make sure the ITS play-ahead preview runs the same dilated engine path as committed runs (it already uses the engine; just verify no preview helper reads world time for cast progress).
    Done: Audited interaction/**, battlePhase hooks, PreviewRenderer: no world-clock cast progress; fixed `isPreviewCastInstance` via new `beganAtLocalTime` (caster local now at begin, set in begin/beginResume/replay), falling back to `beganAtGameTime`.
- [x] Tests: timeline math for step rates 1, 2 and 0.5.
    Done: `itsTimelineMath.test.ts` covers rates 1/2/0.5; `isITSPreviewComplete.test.ts` covers the local-time comparison.

### Step 10 — Generic TimeDilationBuff + Ease Burdens (0906) + research node

Files (expected): new `buffs/TimeDilationBuff.ts` (+ presets), `buffs/buffRegistry.ts`, `buffs/buffVisuals.ts`, new `card_defs/09_gravity_core/0906_EaseBurdens/0906Ability.ts`, new `0906Ability.test.ts`, `card_defs/09_gravity_core/gravityConstants.ts`, `card_defs/09_gravity_core/GravityCore.md`, `card_defs/index.ts`, `abilities/AbilityRegistry.ts`, `app/js/researchTrees/trees/gravity.ts`.

- [x] Add `TimeDilationBuff` (`'time_dilation'`): configurable tempo, focal flag / explicit world pace, world-time duration, stacking-by-source rules. Carries a `timeModifier` per Step 3. Add `TIME_DILATION_PRESETS.focalHaste2x` (tempo 2, focal, 3 s). Register it and give it a subtle gravity-violet visual (e.g. a faint speed-line/afterimage aura).
    Done: `buffs/TimeDilationBuff.ts` (`TimeDilationBuff({sourceId,tempo,focal?,durationSeconds})`, `fromPreset`, `applyTimeDilationBuff` refreshes same-source, `TIME_DILATION_PRESETS.focalHaste2x`); registered in `buffRegistry`, violet streak visual in `buffVisuals`.
- [x] Add Ease Burdens (0906) per the locked design: ally/self target, 2 Gravity cost, 1 use per round, applies the preset. Follow `creating-an-ability` / `card_defs/SKILL.md` (AbilityRegistry registration, keyword description style). Constants go in `gravityConstants.ts`. Update `GravityCore.md`.
    Done: `0906_EaseBurdens/0906Ability.ts` (ally+self select, 2 Gravity, 1 use/round), constants in `gravityConstants.ts`, registered in `AbilityRegistry`/`card_defs/index`, `GravityCore.md` updated.
    - Description should explain the effect plainly (e.g. "Target ally moves and acts twice as fast for 3 seconds").
- [x] Add research node `gravity_ease_burdens`: tier 13, requires `gravity_core`, unlocks 0906. Rearrange node `position`s in `researchTrees/trees/gravity.ts` so Gravity Shield and Ease Burdens sit as clean tier-13 siblings off Core, with nothing overlapping. For example, put the two tier-13 nodes on the top row either side of Core's column, and keep the spine (Core → Locus → Repulse) and the lower row unchanged.
    Done: Node added at tier 13 requiring Core, position (180,160) directly above Core; Gravity Shield stays at (420,160); spine and lower row unchanged.
- [x] `0906Ability.test.ts`:
    Done: `0906Ability.test.ts` (6 tests) covers apply, pace 0.5, tempo 2, expiry at 3 s, self/ally/enemy targeting, refresh, JSON round-trip.
    - casting on an ally applies the buff;
    - world pace becomes 0.5 while it is active;
    - the ally's tempo is 2;
    - after 3 s of world time the buff is gone and the pace is 1;
    - it can target self and allies but not enemies.

### Step 11 — Agent documentation for time dilation

Files (expected): `game/time/AGENTS.md` (expand the Step 1 stub into the full guide), new `.claude/skills/time-dilation/SKILL.md` (plus a `.cursor/skills/` mirror if sibling skills are mirrored), `app/js/games/minion_battles/AGENTS.md`, `.claude/skills/game-engine/SKILL.md` (and its `.cursor/skills/` mirror if present), `.claude/skills/creating-an-ability/SKILL.md`, `.claude/skills/ability-tests/SKILL.md`, `game/effects/AGENTS.md`, `game/deathSequences/AGENTS.md`, `docs/TODO.md`.

- [x] Expand `game/time/AGENTS.md` into the full agent guide (follow `writing-nested-agents-files`). It covers:
    - the vocabulary table;
    - a **"which clock do I use?" decision list** for new code (world / local / tick / wall, with examples per system);
    - the pace-1 invariance rule;
    - how step pieces, the piece budget and time debt work;
    - how to add a tempo source (a `Buff.timeModifier`, a projectile buff, a focal request with an explicit world pace);
    - how to start a Time Stop and choose a frozen-hit policy;
    - frozen-actor rules (damage, death, stored momentum, held orders, no AI, not a parallel waiter);
    - the effect `timeDomain` override;
    - the owner-clock site list from Step 4;
    - known pitfalls: never compute cast elapsed from `engine.gameTime`; never count ticks for gameplay durations; tick-cadence systems (AI) are intentional.
    Done: `game/time/AGENTS.md` rewritten as one guide (vocabulary, which-clock list, pieces/debt, tempo sources, Time Stop, frozen rules, owner-clock list, pitfalls, verified Known limitations).
- [x] Add a `time-dilation` skill (follow `working-with-skills`). Its description should trigger on tempo, haste, slow, world pace, Time Stop, hit-stop, and "which clock". It stays short and points at `game/time/AGENTS.md` as the source of truth.
    Done: `.claude/skills/time-dilation/SKILL.md` (mirrored to `.cursor/skills/`).
- [x] Cross-link it:
    - the directory table and the "Build the engine" section of `minion_battles/AGENTS.md`;
    - the `game-engine` skill's tick-loop section (world pace, tick time, local time, step pieces);
    - `creating-an-ability` (abilities read cast time via `getCastElapsed`, and haste/slow behaviour comes from the system, not ability code);
    - the `ability-tests` skill (the new Time Dilation section and how to write dilation scenarios);
    - `game/effects/AGENTS.md` (`timeDomain`);
    - `game/deathSequences/AGENTS.md` (the storyPause → Time Stop TODO);
    - wherever buff properties are documented (`Buff.timeModifier` / `Buff.clock` and the projectile buff list).
    Done: linked from `minion_battles/AGENTS.md`, `game/SKILL.md`, game-engine/creating-an-ability/ability-tests skills (both mirrors), effects and deathSequences AGENTS, game-object-def-pattern skill.
- [x] Add TODOs to `docs/TODO.md` (via `working-with-todos`):
    - clean up **discard duration** (confirmed world time; consolidate its semantics with uses/cooldowns);
    - implement hit-stop on top of the time system using `HIT_STOP_DEFAULTS` (freeze modifier on attacker + victim; `MeleeAttack` already calls `requestHitPause(3)`);
    - consider expressing death-sequence `storyPause` as a Time Stop.
    Done: three rows added under Medium in `docs/TODO.md`.

### Step 12 — Time Dilation AbilityTest section and scenarios

Files (expected): new `testing/scenarios/general/timeDilation.ts`, `testing/scenarios/registry.ts`, new `testing/scenarios/timeDilation.scenarios.test.ts`.

- [x] Add a new **Time Dilation** section to the Ability Test page. Add `{ slug: 'time-dilation', section: 'Time Dilation' }` to `GENERAL_GROUP_ORDER` in `registry.ts`; every scenario below uses `category: 'general'` and `generalSection: 'Time Dilation'`, and is added to `ALL_ABILITY_TEST_SCENARIOS` (export them as `TIME_DILATION_SCENARIOS`).
    Done: `time-dilation` slug added to `GENERAL_GROUP_ORDER`; `TIME_DILATION_SCENARIOS` spread into `ALL_ABILITY_TEST_SCENARIOS`.
- [x] Write the scenarios in `testing/scenarios/general/timeDilation.ts`. Keep them high level, deterministic and short, with a comment on why each exists. Use enough `maxDurationMs` headroom: at pace 0.5 a scenario needs about twice the ticks.
    - `time_dilation_ease_burdens_haste`: a caster casts Ease Burdens (0906) on an ally that then walks a fixed path next to an identical control unit.
        - While hasted: world pace is 0.5 and the ally covers about 2× the control's distance.
        - After 3 s world time the buff expires and pace returns to 1.
        - A follow-up cast queued in `buildEngine()` finishes in half the world time.
    - `time_dilation_projectile_tempo`: a 0.5-tempo projectile (via a projectile buff) and a 1-tempo projectile fired side by side. The slow one reaches the same distance later. A 50× projectile fired at a wall stops at the wall.
    - `time_dilation_time_stop`: a Time Stop with an exempt caster that keeps casting.
        - A frozen enemy takes immediate damage.
        - Its knockback momentum is stored and released on resume.
        - `gameTime` and the round timer hold during the stop, and the stop ends on its tick-time duration.
    - `time_dilation_extreme_tempo`: a 100× local-dilated unit walking into walls never ends up inside a wall, and the piece budget holds (debt carried, no hang).
    Done: `general/timeDilation.ts` has all four scenarios (ids `time_dilation_*`), driven by per-engine observers inside `assertPass`; all pass headless.
- [x] Add the thin Vitest wiring `timeDilation.scenarios.test.ts` (same shape as `darknessStrength.scenarios.test.ts`: one `runScenarioHeadless` assertion per scenario). Per-step verification runs **only this file** plus lint/tsc.
    Done: `timeDilation.scenarios.test.ts` loops `TIME_DILATION_SCENARIOS`, one `runScenarioHeadless` assertion each (4 pass); lint and tsc clean.

### Step 13 — Final verification

Files (expected): none new; fixes only where regressions are found.

- [x] Run once: `npm run lint`, `npx tsc --noEmit`, `npm run test`. This is a cross-cutting refactor, so the full suite is warranted here. That includes `testing/runner/SimulationRunner.test.ts`, which runs every AbilityTest scenario (including the Time Dilation section) headlessly. Fix regressions; any existing scenario whose expectations would need to change is a pace-1 invariance bug.
    - Lint 0 errors, tsc clean, `npm run test`: 381 files / 3158 tests pass (2 skipped), including all Time Dilation scenarios. No fixes needed; orchestrator wired the `'owner'` effect tempo resolver in `GameState` during inspection.
- [ ] Check that the Ability Test page lists the **Time Dilation** section with all four scenarios, and that they pass there.
- [ ] Manual browser checklist (report results; do not block on it):
    - Ease Burdens on an ally: the world visibly slows, the ally looks normal speed, and VFX/particles keep their normal speed.
    - The ITS timeline and ghost plan for the hasted ally show shortened casts.
    - Gravity research tree layout is clean, and Ease Burdens unlocks at tier 13 from Core.
    - Two-player lobby: one player hastes; both clients stay in sync (no desync banner) and both see the slow-mo.
