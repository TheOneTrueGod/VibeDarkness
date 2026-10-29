---
name: time-dilation
description: Minion Battles time dilation - tempo, haste, slow, world pace, focal dilation, Time Stop, hitstop, hitstun, frozen actors, local time, and "which clock do I use?". Use when adding haste/slow effects, reading cast or elapsed time, touching gameTime/localTime, or writing dilation tests.
---

# Time Dilation

Actors (units, projectiles) run on their own local clock at a tempo; focal dilations slow the world; Time Stop freezes it. **Source of truth: `app/js/games/minion_battles/game/time/AGENTS.md`** - read it before changing anything clock-related.

## Quick rules

- Name the clock: tick, wall, tick time, world time, local time. Never "time".
- Cast elapsed comes from `getCastElapsed(unit, active, engine)` (local time), never `engine.gameTime - startTime`. A guard test enforces this in `abilities/**` and `card_defs/**`.
- Buff/DoT/regen/cooldown durations are world time; motion and ability timelines are local time; AI cadence stays on ticks; effects are wall time unless they opt in with `timeDomain`.
- Haste/slow comes from the engine: apply a `TimeDilationBuff` preset (or `Buff.timeModifier`, or a projectile buff). Do not write tempo maths in ability code.
- Pace-1 invariance: with no modifiers, behaviour and serialized state must be byte-identical to before. Existing tests must not change.
- Time Stop: `engine.startTimeStop(...)` is the only entry point; duration is tick time and capped. Frozen-hit policy: Time Stop def, then per-hit option, then default `'immediate'`.
- Strike pauses freeze only the bodies in the hit. Hitstop freezes the striking unit or projectile; hitstun freezes the victim. Apply them with `applyUnitHitPause` / `applyProjectileHitStop` in `buffs/hitPause.ts`. Seconds scale with that actor's tempo; world pace does not. Casts on those actors delay. See `game/time/AGENTS.md`.

## Tests

Time Dilation general section (slug `time-dilation`) in `testing/scenarios/general/timeDilation.ts`; unit/engine tests under `game/time/`. See the **ability-tests** skill. Pace 0.5 needs about twice the ticks, so give scenarios headroom.

## Related

**game-engine** (tick loop), **creating-an-ability**, **ability-tests**, `game/effects/AGENTS.md` (`timeDomain`).
