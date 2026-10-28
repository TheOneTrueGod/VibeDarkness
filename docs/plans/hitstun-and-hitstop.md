# Hitstun and Hitstop — Implementation Plan

Goal: make strikes feel heavier by freezing the bodies in the hit for a few frames. The rest of the world keeps moving. Casts are delayed, not cancelled. Stored momentum (knockback, hover flight) resumes when the freeze ends — the same behaviour Force Push already has.

## What already exists

There is no `hitstun` function. Two separate hooks got this far:

| Piece | Where | What it does today |
|---|---|---|
| `requestHitPause(frames)` | `GameEngine.ts`, called from `MeleeAttack` with `3` | Documented as a global simulation pause. **No-op.** `docs/TODO.md` ("Implement hit-stop on the time system") and `HIT_STOP_DEFAULTS` describe a future freeze on attacker and victim. |
| `HitStopBuff` / `applyHitStop` | `buffs/HitStopBuff.ts`, used only by Force Push | A real freeze. `timeModifier.freeze` sets tempo to 0 for `HIT_STOP_DEFAULTS.ticks` (3) world-seconds. Force Push applies it to the flung unit and the unit it strikes, and to the flung unit on a wall. |

This plan splits that into two named pauses and leaves the global `requestHitPause` unused.

## Plan-level decisions (locked)

- **Hitstop** is the striking body pausing on contact. A unit's own attack freezes that unit. A projectile's contact freezes that projectile, and the caster keeps moving. Default **`DEFAULT_HIT_STOP_TICKS = 2`**.
- **Hitstun** is the unit that got hit pausing. Default **`DEFAULT_HIT_STUN_TICKS = 4`** (a bit longer than hitstop). A small wall-time shake plays on that unit's sprite while the buff is up and the engine is running.
- **Same mechanism as Force Push.** Both are a world-clock `freeze` `TimeModifier` (`tempo` 0). Local time does not advance, so ability timelines, movement, knockback, and AI wait, then continue. This is the existing frozen-actor path in `UnitManager` (`localFrozen`). Do not call `interruptUnitAbilities`, `tryApplyHardCcStun`, or `StunnedBuff`. Hard CC stun stays a different system.
- **Duration unit is ticks of pause the player sees**, converted with `FIXED_DT`. At pace 1 that is exactly that many frames. While world pace is not 1 the pause stretches with world time, matching Force Push. Do not put the duration on the owner clock — a frozen actor's local time does not advance, so the buff would never expire.
- **Expiry timing differs by actor.** Unit buffs are read by `advanceUnitLocalClocks` and removed later in `tickUnitUpkeep`, so a duration of `N * FIXED_DT` already yields N frozen ticks. Projectile buffs are removed in `expireBuffs` *before* the step, so the same duration yields N−1 frozen ticks. The apply helpers must still produce N frozen ticks for both. Pin that with tests; do not share one raw duration if the sample points differ.
- **A fresh pause of the same kind replaces that kind.** Hitstop and hitstun are separate buffs, so a short hitstop cannot cut a longer hitstun short. `ticks <= 0` applies nothing.
- **Per ability.** Optional `hitImpact` on `AbilityStatic`: `{ hitstopTicks?: number; hitstunTicks?: number }`. Omitted fields use the defaults. `0` turns that side off. Abilities that set a number import a named constant. No per-ability tuning in this plan except Force Push, which keeps its current pause.
- **Force Push stays as it plays today.** Same bodies, same 3 ticks (`FORCE_PUSH_HIT_STOP_TICKS`). It keeps using the hitstop buff (the existing test looks for `HIT_STOP_BUFF_TYPE` on both units). It does not also gain a hitstun buff. Route it through the shared helper so there is one implementation.
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

- [ ] Add `DEFAULT_HIT_STOP_TICKS` (2) and `DEFAULT_HIT_STUN_TICKS` (4) in `timeConstants.ts`. Keep `HIT_STOP_DEFAULTS.ticks` at 3 so `applyHitStop` / Force Push do not change length in this step. Point the `HIT_STOP_DEFAULTS` comment at the new split (hitstop on the striking body, hitstun on the victim, freeze modifier, not world pace).
- [ ] Add a `hit_stun` buff that freezes the same way `HitStopBuff` does (world-clock duration, `timeModifier.freeze`). Register it. Export `HIT_STUN_BUFF_TYPE`.
- [ ] In `hitPause.ts`, export `applyUnitHitPause(unit, { ticks, kind: 'hit_stop' | 'hit_stun' }, gameTime, roundNumber)` and `applyProjectileHitStop(projectile, ticks, gameTime)`. `ticks <= 0` or a dead unit applies nothing. Replacing a buff removes only that kind. Duration must leave the actor frozen for exactly `ticks` subsequent full-engine ticks (see the expiry note in the locked decisions). Projectile hitstop uses a projectile buff with `freeze`, source id distinct from other projectile buffs.
- [ ] `hitPause.test.ts`: unit hitstun and hitstop can sit on the same unit; refreshing one does not shorten the other; a unit's local time does not advance for `DEFAULT_HIT_STUN_TICKS` ticks and the active ability is still the same ability afterwards; a projectile's position is unchanged for `DEFAULT_HIT_STOP_TICKS` ticks after `applyProjectileHitStop`, then it moves again. Use the full tick path, not a hand-passed `dt`.

Verify: `npx tsc --noEmit`, `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/buffs/hitPause.test.ts`.

### Step 2 — Per-ability tick overrides

Files: `abilities/Ability.ts`, `buffs/hitPause.ts` (resolver), `buffs/hitPause.test.ts`.

- [ ] Add optional `hitImpact?: { hitstopTicks?: number; hitstunTicks?: number }` to `AbilityStatic`. Document that omitted means the defaults and `0` means that side does not pause.
- [ ] Export `resolveHitImpactTicks(ability)` returning both tick counts. Unknown ability id uses the defaults.
- [ ] Extend `hitPause.test.ts`: omitted fields resolve to the defaults; an override replaces only the field it sets; `0` stays `0`.

Verify: `npx tsc --noEmit`, `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/buffs/hitPause.test.ts`.

### Step 3 — Unit strikes through `tryDamageOrBlock`

Files: `abilities/blockingHelpers.ts`, `abilities/CastBehaviours/MeleeAttack.ts`, `game/GameEngine.ts`, new `abilities/hitImpact.test.ts` (or extend `blockingHelpers` tests if a full engine is already constructed there — prefer a new file if the existing tests use stub engines).

- [ ] On a contact that is not an iFrame miss and not a facing block, including a shield-absorbed hit, call `applyUnitHitPause` for the defender with `hit_stun` and for the attacker unit (when `getUnit` finds one) with `hit_stop`, using `resolveHitImpactTicks(getAbility(abilityId))`. Apply the pauses after damage is attempted and before the function returns, so knockback launched later in the same tick is stored by the freeze on the following tick (same order Force Push uses: knockback, then the buff is already on the unit).
- [ ] Remove `ctx.engine.requestHitPause?.(3)` from `MeleeAttack`. Leave `requestHitPause` as a no-op. Update its doc comment to say strike pauses live in `applyUnitHitPause` / `applyProjectileHitStop`, and this method no longer grows a global pause.
- [ ] `hitImpact.test.ts` on a full engine tick: a melee strike freezes the attacker for `DEFAULT_HIT_STOP_TICKS` and the victim for `DEFAULT_HIT_STUN_TICKS`; the victim's cast is still active afterwards (delayed, not removed); an iFrame miss and a facing block apply neither buff; `hitstopTicks: 0` on the ability skips the attacker pause only.

Verify: `npx tsc --noEmit`, `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/abilities/hitImpact.test.ts app/js/games/minion_battles/abilities/CastBehaviours/MeleeAttack.lockOnMode.test.ts`.

### Step 4 — Projectile strikes

Files: `game/projectiles/Projectile.ts`, new `game/projectiles/projectileHitPause.test.ts`.

- [ ] When a projectile connects with a unit (damaging hit and knockback-only overflow), `applyProjectileHitStop` on that projectile and `applyUnitHitPause` hitstun on the victim. Tick counts come from `resolveHitImpactTicks` of `sourceAbilityId`. Do not freeze `sourceUnitId`'s unit.
- [ ] Test on a full engine tick: after the hit, the projectile stays put for `DEFAULT_HIT_STOP_TICKS` ticks and the caster's position keeps changing over those ticks; the victim has `HIT_STUN_BUFF_TYPE`; an iFrame miss applies neither.

Verify: `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/game/projectiles/projectileHitPause.test.ts`.

### Step 5 — One-shot strikes that call `takeDamage` directly

Files: `card_defs/05_earth_core/0530_StoneTomb/0530Ability.ts`, `buffs/GravityLocusFieldBuff.ts` (explosion only), `buffs/LiftedBuff.ts` (slam), `card_defs/09_gravity_core/0905_Collapse/0905Ability.ts`, `card_defs/0110_ShiningBlock/0110Ability.ts` (retaliation cone), `card_defs/0118_SneakyPunch/0118Ability.ts` (bonus hit), `card_defs/0108_ThrowChargedRock/0108Ability.ts` (explosion), `abilities/events/AbilityEventRuntime.ts` (`triggerAoEExplosion`). Read `abilities/passiveRunner.ts`; hook a one-shot strike effect if one exists, and leave periodic pulses alone.

- [ ] Beside each of those one-shot `takeDamage` calls, apply hitstop to the striking unit and hitstun to each victim, using `resolveHitImpactTicks` for that ability. The Charged Rock explosion hitstops the projectile when it is still the striking body; it does not also freeze the caster. Sneaky Punch's bonus hit may refresh the pauses the melee strike just applied in the same tick.
- [ ] Do not add pauses to bleed, darkness corruption, drowning, daylight, thorns, terrain crush, slingshot, damage links, or Gravity Locus's repeating field pulse.
- [ ] Add a focused test only where a co-located test file already drives that strike on a full engine (Stone Tomb, Collapse, or Charged Rock — whichever already ticks the engine). Assert the victim gains `HIT_STUN_BUFF_TYPE` on the strike. Skip Vitest for a file that has no such test; say so in the checklist summary.

Verify: `npm run lint:changed`, then `npx vitest run` on only the co-located test files this step actually edited.

### Step 6 — Force Push uses the shared helper

Files: `card_defs/09_gravity_core/0902_ForcePush/0902Ability.ts`, `0902Ability.test.ts`.

- [ ] Export `FORCE_PUSH_HIT_STOP_TICKS` as 3 (today's `HIT_STOP_DEFAULTS.ticks` length). Replace `applyHitStop(...)` with `applyUnitHitPause(..., { ticks: FORCE_PUSH_HIT_STOP_TICKS, kind: 'hit_stop' })` on the same units as now: flung and struck on a unit contact, flung only on a wall. Do not add a hitstun buff here.
- [ ] Keep the existing "hit-stops them on contact" test passing against `HIT_STOP_BUFF_TYPE`.

Verify: `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/card_defs/09_gravity_core/0902_ForcePush/0902Ability.test.ts`.

### Step 7 — Victim shake

Files: new `game/GameRenderer/renderers/hitStunShake.ts`, new `hitStunShake.test.ts`, `game/GameRenderer/renderers/UnitRenderer.ts`.

- [ ] Export a pure `hitStunShakeOffset(nowMs, unitId)` using named amplitude and frequency constants (a couple of pixels, a few cycles over the stun). Deterministic from those inputs. No engine RNG.
- [ ] In `UnitRenderer`, while the unit has `HIT_STUN_BUFF_TYPE` and the engine is not paused, add that offset to the existing render offset. While paused, add nothing (the order screen holds a still pose). Do not write the offset back onto `unit.x` / `unit.y`.
- [ ] Unit-test the pure function: same inputs repeat; a different `unitId` or `nowMs` can change the offset; the offset stays within the amplitude constant.

Verify: `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/game/GameRenderer/renderers/hitStunShake.test.ts`.

### Step 8 — Docs and the old TODO

Files: `game/time/AGENTS.md`, `game/time/timeConstants.ts` (comment only if Step 1 left `HIT_STOP_DEFAULTS` sounding like a placeholder), `.cursor/skills/time-dilation/SKILL.md`, `.claude/skills/time-dilation/SKILL.md`, `docs/TODO.md`.

- [ ] In `game/time/AGENTS.md`, replace the "hit-stop is a placeholder" lines with the locked vocabulary: hitstop, hitstun, who freezes, world-clock freeze, casts delay, Force Push's explicit 3-tick hitstop, and the projectile expire-before-step caveat. Drop `requestHitPause` from the "how to add a pause" path.
- [ ] Update both time-dilation skill files so the hit-stop bullet describes the shipped helper instead of a no-op.
- [ ] Remove the "Implement hit-stop on the time system" row from `docs/TODO.md`.

Verify: `npm run lint:changed` (docs and comments only — skip Vitest if no runtime file changed in this step).

### Step 9 — AbilityTest scenario and the one broad run

Files: `testing/scenarios/general/timeDilation.ts`, `testing/scenarios/registry.ts` if the scenario is not picked up by the existing Time Dilation section export.

- [ ] Add one general scenario in the Time Dilation section. A melee strike connects. While sampling mid-run (same closure pattern as the other scenarios in that file), record that the victim still has the cast it had when the blow landed (`HIT_STUN_BUFF_TYPE` present, active ability id unchanged). `assertPass` becomes true only after that sample has happened and the hitstun buff is gone. Keep the map tiny. Give the player a wait or move order so the runner does not idle out first.
- [ ] Run that scenario headless once, then the broad check: `npm run lint:changed`, `npx tsc --noEmit`, `npm run test`. Failures that are only "this striking cast or knockback is `DEFAULT_HIT_STOP_TICKS` / `DEFAULT_HIT_STUN_TICKS` later" get their step counts updated using those constants. A failure where a cast was cancelled, a DoT applied a pause, or pace-1 with no strike changed JSON is a real bug — fix the system, do not loosen the old expectation.
- [ ] Manual browser checklist (human, not a worker blocker): in a battle, land a melee hit and a projectile hit. The attacker or projectile hitches for about two frames, the victim hitches a little longer and shakes, and the victim's swing continues afterwards instead of dropping. Force Push's mutual pause still reads the way it does today.

Verify: the commands in the checklist item above. This is the only step that runs the full suite and the AbilityTest scenario.
