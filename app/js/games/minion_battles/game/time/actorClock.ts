/**
 * Actor clocks — per-unit local time, tempo from buffs, and cast-elapsed reads. See `./AGENTS.md`.
 *
 * `unit.localTime` is the time a unit has experienced. It advances once per tick by
 * `getUnitLocalStep(...)` (`getStepRate x dt`). At pace 1 with no time modifiers the step is exactly `dt`,
 * so `localTime` tracks `engine.gameTime` bit for bit (the pace-1 invariance rule).
 *
 * Engines with no TimeManager (unit-test stubs that bump `gameTime` by hand) have one clock: a unit whose
 * local clock has not been started by `advanceUnitLocalClocks` reads the world clock instead.
 */
import type { Unit } from '../units/Unit';
import type { ActiveAbility } from '../types';
import type { TimeManager } from './TimeManager';
import { resolveFocalWorldPaceRequest, resolveTempo, type TimeModifier } from './TimeModifier';

/** The slice of the engine these helpers read. `timeManager` is absent on stub engines. */
export interface ActorClockEngine {
    gameTime: number;
    timeManager?: Pick<TimeManager, 'getStepRate'> & Partial<Pick<TimeManager, 'getFrozenHitPolicy'>>;
}

/** The unit's local "now", or `worldTime` when its local clock has not been started (stub engines, spawn tick). */
export function localNow(unit: Pick<Unit, 'localClockActive' | 'localTime'>, worldTime: number): number {
    return unit.localClockActive ? unit.localTime : worldTime;
}

/** Elapsed local seconds of a cast: `localNow - active.startTime` (`startTime` is a local-time timestamp). */
export function getCastElapsed(
    unit: Pick<Unit, 'localClockActive' | 'localTime'>,
    active: Pick<ActiveAbility, 'startTime'>,
    engine: { gameTime: number },
): number {
    return localNow(unit, engine.gameTime) - active.startTime;
}

/** Tempo modifiers currently carried by a unit's buffs (empty array when none). */
export function collectActorTimeModifiers(actor: Pick<Unit, 'buffs'>): TimeModifier[] {
    let out: TimeModifier[] | undefined;
    for (const b of actor.buffs) {
        const m = b.timeModifier;
        if (m) (out ??= []).push(m);
    }
    return out ?? [];
}

/**
 * Actor tempo: product of its buff `timeModifier`s, clamped; 0 when frozen. Does not include world pace or
 * Time Stop (those are in `TimeManager.getStepRate`). 1 when the actor has no modifiers.
 */
export function getActorTempo(actor: Pick<Unit, 'buffs'>, _engine?: unknown): number {
    if (actor.buffs.length === 0) return 1;
    const mods = collectActorTimeModifiers(actor);
    return mods.length === 0 ? 1 : resolveTempo(mods);
}

/** Per-tick multiplier of the base dt for a unit: world pace, Time Stop exemption and tempo combined. */
export function getActorStepRate(actor: Pick<Unit, 'buffs' | 'id'>, engine: ActorClockEngine): number {
    const tm = engine.timeManager;
    if (!tm) return 1;
    return tm.getStepRate(actor, getActorTempo(actor, engine));
}

/** Local seconds a unit experiences this tick. Exactly `baseDt` at rate 1 (no float drift). */
export function getUnitLocalStep(unit: Pick<Unit, 'buffs' | 'id'>, engine: ActorClockEngine, baseDt: number): number {
    const rate = getActorStepRate(unit, engine);
    return rate === 1 ? baseDt : rate * baseDt;
}

/**
 * The unit's local time after the tick about to run, and its step. Mirrors what `advanceUnitLocalClocks`
 * will do, for the pre-tick select-target lookahead (which runs before the clocks advance).
 */
export function projectNextLocalTime(
    unit: Pick<Unit, 'buffs' | 'id' | 'localClockActive' | 'localTime'>,
    engine: ActorClockEngine,
    baseDt: number,
): { next: number; step: number } {
    const step = getUnitLocalStep(unit, engine, baseDt);
    return { next: localNow(unit, engine.gameTime) + step, step };
}

/**
 * Advance every unit's local clock for the tick that just incremented `gameTime`. Call right after the
 * increment and before orders apply, so a cast started this tick stamps `startTime` after the advance
 * (matching `startTime = gameTime` at pace 1). A unit seen for the first time starts at `prevGameTime`.
 */
export function advanceUnitLocalClocks(
    units: readonly Unit[],
    engine: ActorClockEngine,
    baseDt: number,
    prevGameTime: number,
): void {
    for (const unit of units) {
        if (!unit.localClockActive) {
            unit.localClockActive = true;
            unit.localTime = prevGameTime;
        }
        const step = getUnitLocalStep(unit, engine, baseDt);
        unit.localStep = step;
        unit.localTime += step;
        // Frozen (tempo 0) units run nothing this tick; hits on them follow the frozen-hit policy.
        unit.localFrozen = step === 0;
        unit.frozenHitPolicyFromStop = unit.localFrozen ? engine.timeManager?.getFrozenHitPolicy?.(unit.id) : undefined;
    }
}

/**
 * Focal world-pace requests from units' buff `timeModifier`s (each in `[WORLD_PACE_MIN, 1]`).
 * Dead or inactive units do not request.
 */
export function collectUnitFocalRequests(units: readonly Unit[]): number[] {
    const out: number[] = [];
    for (const unit of units) {
        if (unit.buffs.length === 0 || !unit.active || !unit.isAlive()) continue;
        for (const b of unit.buffs) {
            const m = b.timeModifier;
            if (m?.focal && !m.freeze) out.push(resolveFocalWorldPaceRequest(m));
        }
    }
    return out;
}

/**
 * Elapsed seconds of a cast at an explicit "cast now" (the caster's local time). For render hooks such as
 * `AbilityStatic.renderActivePreview`, whose `gameTime` argument is the caster's local time, not world time.
 */
export function getCastElapsedAt(active: Pick<ActiveAbility, 'startTime'>, castNow: number): number {
    return castNow - active.startTime;
}
