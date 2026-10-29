# Hitstun and Hitstop — Implementation Plan

**Completed 2026-10-27:** Strikes freeze only the bodies in the hit. Hitstop is `2 * FIXED_DT` seconds on the striking unit or projectile, hitstun is `4 * FIXED_DT` on the victim, and both scale with that actor's tempo. Casts delay and then continue, and the victim shakes while the battle is running. Follow-ups: the in-battle hitch still needs a human look, and `earthAttuned.test.ts` still fails on Digging Claws `roundCharge` (unchanged by this plan).

Goal: make strikes feel heavier by freezing the bodies in the hit for a few frames. The rest of the world keeps moving. Casts are delayed, not cancelled. Stored momentum (knockback, hover flight) resumes when the freeze ends — the same behaviour Force Push already has.

## What already exists

There is no `hitstun` function. Two separate hooks got this far:

| Piece | Where | What it does today |
|---|---|---|
| `requestHitPause(frames)` | `GameEngine.ts`, called from `MeleeAttack` with `3` | Documented as a global simulation pause. **No-op.** `docs/TODO.md` ("Implement hit-stop on the time system") and `HIT_STOP_DEFAULTS` describe a future freeze on attacker and victim. |
| `HitStopBuff` / `applyHitStop` | `buffs/HitStopBuff.ts`, used only by Force Push | A per-actor freeze. `timeModifier.freeze` sets that unit's tempo to 0 (no `focal`, so world pace stays put) for 3 ticks of world time. Force Push applies it to the flung unit and the unit it strikes, and to the flung unit on a wall. |

This plan splits that into two named pauses and leaves the global `requestHitPause` unused.

## Plan-level decisions (locked)

- **Hitstop** is the striking body pausing on contact. A unit's own attack freezes that unit. A projectile's contact freezes that projectile, and the caster keeps moving. Default **`DEFAULT_HIT_STOP_SECONDS = 2 * FIXED_DT`** (2 ticks at tempo 1).
- **Hitstun** is the unit that got hit pausing. Default **`DEFAULT_HIT_STUN_SECONDS = 4 * FIXED_DT`** (4 ticks at tempo 1, a bit longer than hitstop). A small wall-time shake plays on that unit's sprite while the buff is up and the engine is running.
- **Only the bodies in the hit.** Hitstop freezes the striking unit, or the striking projectile. Hitstun freezes the unit that was hit. Every other unit and projectile keeps its current tempo. `worldPace` stays whatever it already was. Do not call `startTimeStop`, do not write `worldPace`, and do not set `focal` on the modifier (`collectUnitFocalRequests` already ignores a `freeze` modifier, and a focal flag would slow the whole battle). `requestHitPause` is the global pause and stays a no-op.
- **Same mechanism as Force Push, scoped to those actors.** `timeModifier.freeze` sets that actor's tempo to 0. Their local time does not advance, so their ability timeline, movement, knockback, and AI wait, then continue. This is the existing per-actor path in `UnitManager` (`localFrozen`) and `ProjectileManager` (skip the step when tempo is 0). Do not call `interruptUnitAbilities`, `tryApplyHardCcStun`, or `StunnedBuff`. Hard CC stun stays a different system.
- **The authored length is seconds, equal to a few ticks at normal speed.** `FIXED_DT` is one tick (`1/60`). Hitstop is `2 * FIXED_DT` seconds and hitstun is `4 * FIXED_DT` seconds, so at tempo 1 they last 2 and 4 ticks. Abilities override with seconds, not raw tick counts.
- **That length scales with the actor's tempo.** Tempo is the unit or projectile's local-time rate modifier (`getActorTempo` / `Projectile.getTempo`), not world pace. Sample it at the hit, ignoring any `freeze` modifier (the pause itself sets tempo to 0, and a frozen local clock would never expire). Frozen ticks = `seconds / FIXED_DT / tempo`. Tempo 2 cuts the hitch in half (hitstop 1 tick, hitstun 2). Tempo 0.5 doubles it (4 and 8). World pace does not scale it: a slowed battle still hitches for 2 and 4 ticks when tempo is 1. Round to the nearest whole tick. A result that rounds to 0 applies no pause (extreme haste can skip the hitch). Do not store the timer on the owner clock.
- **Expiry timing differs by actor.** Unit buffs are read by `advanceUnitLocalClocks` and removed later in `tickUnitUpkeep`. Projectile buffs are removed in `expireBuffs` *before* the step, so the same deadline can freeze a projectile one tick less than a unit. The apply helpers must still produce N frozen ticks for both. Pin that with tests. Leave the existing `HitStopBuff` world-time timer alone until Step 6 moves Force Push onto the shared helper.
- **A fresh pause of the same kind replaces that kind.** Hitstop and hitstun are separate buffs, so a short hitstop cannot cut a longer hitstun short. Re-sample tempo on the new hit. `seconds <= 0` applies nothing.
- **Per ability.** Optional `hitImpact` on `AbilityStatic`: `{ hitstopSeconds?: number; hitstunSeconds?: number }`. Omitted fields use the defaults. `0` turns that side off. Abilities that set a number import a named constant. No per-ability tuning in this plan except Force Push, which keeps its current base length.
- **Force Push stays as it plays today at tempo 1.** Same bodies, base length `FORCE_PUSH_HIT_STOP_SECONDS = 3 * FIXED_DT` (today's 3 ticks). The shared tempo scale applies, so a hasted or slowed body hitches for a different tick count. It keeps using the hitstop buff (the existing test looks for `HIT_STOP_BUFF_TYPE` on both units). It does not also gain a hitstun buff. Route it through the shared helper so there is one implementation.
- **Which contacts count.** A strike contact:
  - `tryDamageOrBlock` when the attack is not an iFrame miss and not a facing block. A hit fully absorbed by shields still counts (the blow landed).
  - A projectile connecting with a unit, including knockback-only overflow.
  - One-shot strike `takeDamage` sites that never enter those two paths (listed in Step 5).
- **Ordinary damage stays ordinary damage.** Repeating or environmental HP loss does not pause anyone: bleed and other DoT ticks, darkness corruption, drowning, daylight, thorns, terrain crush, slingshot bounces, damage links, Gravity Locus's repeating field pulse, and test fixtures that call `takeDamage` directly. A locus *explosion*, a slam, a tomb hit, and a retaliation cone are strikes.
- **`requestHitPause` stays a no-op.** Remove the `MeleeAttack` call so melee does not look like it still wants a global pause. The real pause comes from the strike helper.
- **Serialization.** Reuse the buff list and projectile buff list. No new checkpoint fields, no `UPGRADE_STEPS` entry. With no strike in progress, pace-1 JSON and fingerprints stay as they are. `localFrozen` is already derived each tick from the freeze buff.
- **Order pause.** A frozen unit is already skipped as a parallel waiter and holds orders. A 2–4 tick delay of that pause is acceptable. Do not special-case player units.

## Key existing code index

| Concern | Location |
|---|---|
| Freeze buff | `buffs/HitStopBuff.ts` (`applyHitStop`, `HIT_STOP_BUFF_TYPE`), registered in `buffs/buffRegistry.ts` |
| Placeholder defaults | `game/time/timeConstants.ts` (`HIT_STOP_DEFAULTS`), `GameEngine.requestHitPause` |
| Frozen actors | `game/time/AGENTS.md` "Frozen actors"; `UnitManager` skips ability, movement, knockback, and AI when `localFrozen`; upkeep still runs so a freeze buff can expire |
| Tempo resolve | `game/time/TimeModifier.ts` (`resolveTempo`: any `freeze` returns 0) |
| Unit strike choke point | `abilities/blockingHelpers.ts` `tryDamageOrBlock` |
| Attack behaviours that already use it | `CastBehaviours/BaseAttackBehaviour.ts`, `DashBehaviour.ts`, `ChargeBehaviour.ts`, `PulseBehaviour.ts`, `abilities/targetHelpers.ts` |
| Projectile contact | `game/projectiles/Projectile.ts` (damaging hit and knockback-only overflow), `ProjectileBuff.ts`, `ProjectileManager.update` (expire, then skip when tempo is 0) |
| Force Push | `card_defs/09_gravity_core/0902_ForcePush/0902Ability.ts` (`onFlingUnitHit`, `onFlingWall`), test in `0902Ability.test.ts` |
| Melee no-op call | `abilities/CastBehaviours/MeleeAttack.ts` (`requestHitPause?.(3)`) |
| Victim sprite position | `game/GameRenderer/renderers/UnitRenderer.ts` (render offset is already summed before `visual.x` / `visual.y`) |
| Clock rules | `game/time/AGENTS.md`, **time-dilation** skill |
| Full-engine tick harness | `game/time/unitTempo.test.ts`, `game/time/actorClock.test.ts` |
| AbilityTest sampling | `testing/scenarios/general/timeDilation.ts` (closure flags sampled from `assertPass` as the runner steps) |

## Agent Instructions

This plan is executed by `/jp-implement-plan` (see `.cursor/skills/jp-implement-plan/SKILL.md` — do not restate its workflow here). The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously** (never in the background), waits for each worker to finish, then moves to the next step, and finally reports plan completion to the user. Each worker implements **exactly one step**, checks off that step's checklist items with a one-line summary under each, and **stops without spawning the next agent**.

Project skills relevant to this plan (workers should invoke the ones matching their step):

- `working-on-minion-battles` — always.
- `time-dilation` and `game/time/AGENTS.md` — every step that freezes an actor. Name the clock. Pace 1 with no active pause stays byte-identical.
- `game-engine` — Steps 3–5 (strike path, tick loop). No checkpoint upgrade.
- `game-object-def-pattern` — Step 1 (buff type vs instance duration). `hitImpact` is ability-def data, not unit instance state.
- `editing-card-behaviour` — Step 6 (Force Push only).
- `ability-tests` — Step 9.
- `scoped-testing` — per-step Vitest scope.

**Verification cadence:** per step, `npm run lint:changed`, `npx tsc --noEmit` only when the step crosses an interface boundary, and only the specific test files the step lists. No full-suite, whole-directory, or AbilityTest run in Steps 1–8. Step 9 runs those once.

Hand-rolled tests that pass a raw `dt` into `tickUnitActiveAbilities` never consult `localFrozen`. Assert the pause on a full engine tick (`fixedUpdate` / the time-test harness), or assert the buff plus a clock advance through `advanceUnitLocalClocks`.

---

### Step 1 — Pause constants and the shared apply helpers

Files: `game/time/timeConstants.ts`, `buffs/HitStopBuff.ts`, `buffs/buffRegistry.ts`, new `buffs/hitPause.ts`, new `buffs/hitPause.test.ts`. Leave Force Push's calls on `applyHitStop` until Step 6.

- [x] Add `DEFAULT_HIT_STOP_SECONDS = 2 * FIXED_DT` and `DEFAULT_HIT_STUN_SECONDS = 4 * FIXED_DT` in `timeConstants.ts`. Keep `HIT_STOP_DEFAULTS.ticks` at 3 so `applyHitStop` / Force Push do not change length in this step. Point the `HIT_STOP_DEFAULTS` comment at the new split (hitstop on the striking body, hitstun on the victim, per-actor freeze, tempo-scaled seconds).
  - Added both constants; `HIT_STOP_DEFAULTS.ticks` is still 3 and the comment now describes the hitstop/hitstun split.
- [x] Add a `hit_stun` buff that freezes only its holder, the same way `HitStopBuff` does (`timeModifier.freeze`, no `focal`). Its deadline is the tempo-scaled tick count from the locked duration rule, not the owner clock and not world pace. Register it. Export `HIT_STUN_BUFF_TYPE`.
  - `HitPauseBuff` (`HIT_STUN_BUFF_TYPE`) freezes with no focal; `pauseTicks` is the deadline, registered in `buffRegistry.ts`. Force Push `HitStopBuff` JSON (no `pauseTicks`) still restores as the world-time buff.
- [x] In `hitPause.ts`, export `hitPauseTicks(seconds, tempo)` (`seconds / FIXED_DT / tempo`, nearest whole tick, `0` when that rounds to 0 or `seconds <= 0`). Export `applyUnitHitPause(unit, { seconds, kind: 'hit_stop' | 'hit_stun' }, gameTime, roundNumber)` and `applyProjectileHitStop(projectile, seconds, gameTime)`. Each samples that actor's tempo with freeze modifiers removed (1 when none remain). A dead unit applies nothing. Replacing a buff removes only that kind. The pause must leave that actor frozen for exactly `hitPauseTicks` subsequent full-engine ticks at the sampled tempo (see the expiry note) and must leave `worldPace` untouched. Projectile hitstop uses a projectile buff with `freeze` and no `focal`, source id distinct from other projectile buffs.
  - Helpers sample tempo with `freeze` removed. Unit upkeep on the apply tick (same `gameTime`) does not consume a tick. Projectile source `projectile_hit_stop` sets `hitPauseSteps` (kept for the step, then decremented in `expireBuffs`) so N steps freeze despite expire-before-step; `worldPace` is not written.
- [x] `hitPause.test.ts`: unit hitstun and hitstop can sit on the same unit; refreshing one does not shorten the other; at tempo 1 a paused unit's local time does not advance for 4 ticks (`DEFAULT_HIT_STUN_SECONDS`) and its active ability is still the same ability afterwards; tempo 2 freezes that unit for 2 ticks and tempo 0.5 for 8, while world pace 0.5 at tempo 1 still freezes for 4; a bystander keeps advancing and `worldPace` stays 1; a projectile at tempo 1 stays put for 2 ticks after `applyProjectileHitStop`, then moves, while a second projectile keeps flying. Use the full tick path, not a hand-passed `dt`. Import the second constants rather than writing `2/60`.
  - Tests use the time-test harness (clocks, unit tick, then projectiles). All of the cases above pass, plus projectile hitstop at world pace 0.5. Durations come from the named constants.

Verify: `npx tsc --noEmit`, `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/buffs/hitPause.test.ts`.

### Step 2 — Per-ability duration overrides

Files: `abilities/Ability.ts`, `buffs/hitPause.ts` (resolver), `buffs/hitPause.test.ts`.

- [x] Add optional `hitImpact?: { hitstopSeconds?: number; hitstunSeconds?: number }` to `AbilityStatic`. Document that omitted means the defaults, values are seconds (`n * FIXED_DT` for an n-tick hitch at tempo 1), and `0` means that side does not pause.
  - Added optional `HitImpact` on `AbilityStatic`: omitted fields mean the defaults, seconds are `n * FIXED_DT` at tempo 1, and `0` turns that side off.
- [x] Export `resolveHitImpactSeconds(ability)` returning both durations. Unknown ability id uses the defaults.
  - `resolveHitImpactSeconds` fills omitted fields from the named defaults; `undefined` (unknown id) uses both; `0` is kept with `??`.
- [x] Extend `hitPause.test.ts`: omitted fields resolve to the defaults; an override replaces only the field it sets; `0` stays `0`.
  - Tests cover a missing ability id, omitted `hitImpact`, a one-field override, and `0` on either side.

Verify: `npx tsc --noEmit`, `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/buffs/hitPause.test.ts`.

### Step 3 — Unit strikes through `tryDamageOrBlock`

Files: `abilities/blockingHelpers.ts`, `abilities/CastBehaviours/MeleeAttack.ts`, `game/GameEngine.ts`, new `abilities/hitImpact.test.ts` (or extend `blockingHelpers` tests if a full engine is already constructed there — prefer a new file if the existing tests use stub engines).

- [x] On a contact that is not an iFrame miss and not a facing block, including a shield-absorbed hit, call `applyUnitHitPause` for the defender with `hit_stun` and for the attacker unit (when `getUnit` finds one) with `hit_stop`, using `resolveHitImpactSeconds(getAbility(abilityId))`. Each actor's own tempo scales its pause. Apply the pauses after damage is attempted and before the function returns, so knockback launched later in the same tick is stored by the freeze on the following tick (same order Force Push uses: knockback, then the buff is already on the unit).
  - `tryDamageOrBlock` applies those pauses after `takeDamageDetailed` and before either return, so a shield-absorbed hit still pauses and an iFrame miss or facing block does not.
- [x] Remove `ctx.engine.requestHitPause?.(3)` from `MeleeAttack`. Leave `requestHitPause` as a no-op. Update its doc comment to say strike pauses live in `applyUnitHitPause` / `applyProjectileHitStop`, and this method no longer grows a global pause.
  - Removed the melee call. `requestHitPause` stays a no-op and its comment points at `applyUnitHitPause` / `applyProjectileHitStop`.
- [x] `hitImpact.test.ts` on a full engine tick: at tempo 1 a melee strike freezes the attacker for 2 ticks (`DEFAULT_HIT_STOP_SECONDS`) and the victim for 4 (`DEFAULT_HIT_STUN_SECONDS`); the victim's cast is still active afterwards (delayed, not removed); an iFrame miss and a facing block apply neither buff; `hitstopSeconds: 0` on the ability skips the attacker pause only.
  - Full-engine ticks cover that melee case, plus a shield-absorbed hit that still pauses both bodies. iFrame and facing block apply neither buff. `hitstopSeconds: 0` skips only the attacker pause.

Verify: `npx tsc --noEmit`, `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/abilities/hitImpact.test.ts app/js/games/minion_battles/abilities/CastBehaviours/MeleeAttack.lockOnMode.test.ts`.

### Step 4 — Projectile strikes

Files: `game/projectiles/Projectile.ts`, new `game/projectiles/projectileHitPause.test.ts`.

- [x] When a projectile connects with a unit (damaging hit and knockback-only overflow), `applyProjectileHitStop` on that projectile and `applyUnitHitPause` hitstun on the victim. Durations come from `resolveHitImpactSeconds` of `sourceAbilityId`. The projectile's tempo scales its hitstop; the victim's tempo scales the hitstun. Do not freeze `sourceUnitId`'s unit.
  - `Projectile.checkCollision` applies those pauses after knockback on a damaging hit and on knockback-only overflow. iFrame misses and facing blocks do not. The caster is not frozen.
- [x] Test on a full engine tick: after the hit, a tempo-1 projectile stays put for 2 ticks (`DEFAULT_HIT_STOP_SECONDS`) and the caster's position keeps changing over those ticks; the victim has `HIT_STUN_BUFF_TYPE`; an iFrame miss applies neither.
  - `projectileHitPause.test.ts` covers that hit, plus a knockback-only overflow that pauses both bodies without damage. The projectile moves again on the next tick.

Verify: `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/game/projectiles/projectileHitPause.test.ts`.

### Step 5 — One-shot strikes that call `takeDamage` directly

Files: `card_defs/05_earth_core/0530_StoneTomb/0530Ability.ts`, `buffs/GravityLocusFieldBuff.ts` (explosion only), `buffs/LiftedBuff.ts` (slam), `card_defs/09_gravity_core/0905_Collapse/0905Ability.ts`, `card_defs/0110_ShiningBlock/0110Ability.ts` (retaliation cone), `card_defs/0118_SneakyPunch/0118Ability.ts` (bonus hit), `card_defs/0108_ThrowChargedRock/0108Ability.ts` (explosion), `abilities/events/AbilityEventRuntime.ts` (`triggerAoEExplosion`). Read `abilities/passiveRunner.ts`; hook a one-shot strike effect if one exists, and leave periodic pulses alone.

- [x] Beside each of those one-shot `takeDamage` calls, apply hitstop to the striking unit and hitstun to each victim, using `resolveHitImpactSeconds` for that ability. Each body's own tempo scales its pause. The Charged Rock explosion hitstops the projectile when it is still the striking body; it does not also freeze the caster. Sneaky Punch's bonus hit may refresh the pauses the melee strike just applied in the same tick.
  - Tomb (both stages), locus explosion, slam, Collapse, retaliation cone, and Sneaky Punch's bonus hit pause the striking unit and each victim. Charged Rock and `triggerAoEExplosion` hitstop the projectile and hitstun each victim. `passiveRunner` has no one-shot strike (only an `onTick` pulse), so it was left alone.
- [x] Do not add pauses to bleed, darkness corruption, drowning, daylight, thorns, terrain crush, slingshot, damage links, or Gravity Locus's repeating field pulse.
  - Those paths were not edited. Gravity Locus's repeating `applyPulse` still deals damage with no pause; only the expiry explosion pauses.
- [x] Add a focused test only where a co-located test file already drives that strike on a full engine (Stone Tomb, Collapse, or Charged Rock — whichever already ticks the engine). Assert the victim gains `HIT_STUN_BUFF_TYPE` on the strike. Skip Vitest for a file that has no such test; say so in the checklist summary.
  - `0530Ability.test.ts` ticks the full engine and asserts the dummy has `HIT_STUN_BUFF_TYPE` when stage 1 lands. Collapse only hand-ticks abilities, and Charged Rock has no co-located test, so those files were not given a new Vitest.

Verify: `npm run lint:changed`, then `npx vitest run` on only the co-located test files this step actually edited.

### Step 6 — Force Push uses the shared helper

Files: `card_defs/09_gravity_core/0902_ForcePush/0902Ability.ts`, `0902Ability.test.ts`.

- [x] Export `FORCE_PUSH_HIT_STOP_SECONDS = 3 * FIXED_DT` (today's 3 ticks at tempo 1). Replace `applyHitStop(...)` with `applyUnitHitPause(..., { seconds: FORCE_PUSH_HIT_STOP_SECONDS, kind: 'hit_stop' })` on the same units as now: flung and struck on a unit contact, flung only on a wall. Do not add a hitstun buff here. The helper scales that duration by each unit's tempo.
  - `FORCE_PUSH_HIT_STOP_SECONDS` lives in `gravityConstants.ts`. Both contacts call `applyUnitHitPause` with `kind: 'hit_stop'` only (flung and struck on a unit, flung only on a wall). `applyHitStop` has no callers; `HitStopBuff` remains for old JSON without `pauseTicks`.
- [x] Keep the existing "hit-stops them on contact" test passing against `HIT_STOP_BUFF_TYPE`.
  - The contact test is unchanged and still looks for `HIT_STOP_BUFF_TYPE` on both units. All 12 tests in `0902Ability.test.ts` passed.

Verify: `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/card_defs/09_gravity_core/0902_ForcePush/0902Ability.test.ts`.

### Step 7 — Victim shake

Files: new `game/GameRenderer/renderers/hitStunShake.ts`, new `hitStunShake.test.ts`, `game/GameRenderer/renderers/UnitRenderer.ts`.

- [x] Export a pure `hitStunShakeOffset(nowMs, unitId)` using named amplitude and frequency constants (a couple of pixels, a few cycles over the stun). Deterministic from those inputs. No engine RNG.
  - `hitStunShake.ts` exports `hitStunShakeOffset`: 2px amplitude, 3 cycles over `DEFAULT_HIT_STUN_SECONDS`, phase from the unit id. Same inputs always match. No engine RNG.
- [x] In `UnitRenderer`, while the unit has `HIT_STUN_BUFF_TYPE` and the engine is not paused, add that offset to the existing render offset. While paused, add nothing (the order screen holds a still pose). Do not write the offset back onto `unit.x` / `unit.y`.
  - The render offset gains that shake only when the victim has `HIT_STUN_BUFF_TYPE` and `engine.isPaused` is false. `unit.x` / `unit.y` are not written.
- [x] Unit-test the pure function: same inputs repeat; a different `unitId` or `nowMs` can change the offset; the offset stays within the amplitude constant.
  - `hitStunShake.test.ts` covers repeatability, a different id or time, and travel within `HIT_STUN_SHAKE_AMPLITUDE_PX`. All 3 tests passed.

Verify: `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/game/GameRenderer/renderers/hitStunShake.test.ts`.

### Step 8 — Docs and the old TODO

Files: `game/time/AGENTS.md`, `game/time/timeConstants.ts` (comment only if Step 1 left `HIT_STOP_DEFAULTS` sounding like a placeholder), `.cursor/skills/time-dilation/SKILL.md`, `.claude/skills/time-dilation/SKILL.md`, `docs/TODO.md`.

- [x] In `game/time/AGENTS.md`, replace the "hit-stop is a placeholder" lines with the locked vocabulary: hitstop and hitstun freeze only the involved unit or projectile, durations are `2 * FIXED_DT` and `4 * FIXED_DT` seconds scaled by that actor's tempo, world pace does not scale them, casts on those actors delay, Force Push's `3 * FIXED_DT` hitstop, and the projectile expire-before-step caveat. Drop `requestHitPause` from the "how to add a pause" path.
  - Replaced the placeholder lines with a Strike pauses section (helpers, tempo-scaled seconds, world pace excluded, delayed casts, Force Push `3 * FIXED_DT`, expire-before-step). `requestHitPause` is not on that path. `HIT_STOP_DEFAULTS` comment now describes the legacy world-time buff, not a pending design.
- [x] Update both time-dilation skill files so the hit-stop bullet describes the shipped helper instead of a no-op.
  - Both skill files now point hitstop/hitstun at `applyUnitHitPause` / `applyProjectileHitStop` and `game/time/AGENTS.md`.
- [x] Remove the "Implement hit-stop on the time system" row from `docs/TODO.md`.
  - Removed that Medium row.

Verify: `npm run lint:changed` (docs and comments only — skip Vitest if no runtime file changed in this step).

### Step 9 — AbilityTest scenario and the one broad run

Files: `testing/scenarios/general/timeDilation.ts`, `testing/scenarios/registry.ts` if the scenario is not picked up by the existing Time Dilation section export.

- [x] Add one general scenario in the Time Dilation section. A melee strike connects. While sampling mid-run (same closure pattern as the other scenarios in that file), record that the victim still has the cast it had when the blow landed (`HIT_STUN_BUFF_TYPE` present, active ability id unchanged). `assertPass` becomes true only after that sample has happened and the hitstun buff is gone. Keep the map tiny. Give the player a wait or move order so the runner does not idle out first.
  - `time_dilation_hitstun_delays_cast` in `timeDilation.ts` (already exported via `TIME_DILATION_SCENARIOS`, so `registry.ts` was not edited). An 8×5 map: the player waits, a melee strike hits a victim mid-probe, and pass requires a mid-stun sample of that same ability id plus the hitstun buff gone with the probe still active.
- [x] Run that scenario headless once, then the broad check: `npm run lint:changed`, `npx tsc --noEmit`, `npm run test`. Failures that are only "this striking cast or knockback is 2 or 4 ticks later at tempo 1" get their step counts updated from `DEFAULT_HIT_STOP_SECONDS` / `DEFAULT_HIT_STUN_SECONDS` via `hitPauseTicks`. A failure where a cast was cancelled, a DoT applied a pause, or pace-1 with no strike changed JSON is a real bug — fix the system, do not loosen the old expectation.
  - Headless `time_dilation_hitstun_delays_cast` passed. `lint:changed` and `tsc --noEmit` passed. Full suite was 3719 passed / 4 failed. Double Punch Scenario E sampled punch 2 before the attacker's punch-1 hitstop ended; the world-time check now adds `hitPauseTicks(DEFAULT_HIT_STOP_SECONDS, 1) * FIXED_DT`, and that test passes. The other 3 failures are `earthAttuned.test.ts` (Digging Claws has no `roundCharge` rule). `abilityUses.ts` and `0534Ability.ts` are unchanged by this plan.
- [x] Manual browser checklist (human, not a worker blocker): in a battle, land a melee hit and a projectile hit. The attacker or projectile hitches for about two frames, the victim hitches a little longer and shakes, and the victim's swing continues afterwards instead of dropping. Force Push's mutual pause still reads the way it does today.
  - Remains for a human.

Verify: the commands in the checklist item above. This is the only step that runs the full suite and the AbilityTest scenario.
