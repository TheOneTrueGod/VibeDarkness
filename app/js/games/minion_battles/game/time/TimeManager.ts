/**
 * TimeManager — owned by `GameState`. Holds world pace and active Time Stops, and answers
 * "how fast does this actor step this tick?". See `./AGENTS.md`.
 */
import { FIXED_DT } from '../gameConstants';
import {
    MAX_TIME_STOP_TICK_SECONDS,
    WORLD_PACE_MIN,
    type FrozenHitPolicy,
} from './timeConstants';

export interface TimeStop {
    id: string;
    sourceActorId: string | null;
    /** `engine.gameTick` when started. The stop covers the next `durationTicks` ticks. */
    startTick: number;
    durationTicks: number;
    /** Actors that keep stepping during the stop (at `exemptRate`). */
    exemptActorIds: string[];
    /** Multiplier of FIXED_DT for exempt actors (ignores world pace). */
    exemptRate: number;
    /** The Time Stop def's own policy. Undefined = not specified (per-hit option, then the engine default decide). */
    frozenHitPolicy?: FrozenHitPolicy;
}

export interface StartTimeStopSpec {
    sourceActorId?: string | null;
    /** Tick-time seconds; clamped to `MAX_TIME_STOP_TICK_SECONDS`. */
    durationTickSeconds: number;
    exemptActorIds?: readonly string[];
    exemptRate?: number;
    frozenHitPolicy?: FrozenHitPolicy;
}

export interface SerializedTimeManager {
    worldPace: number;
    timeStops: TimeStop[];
    nextTimeStopSeq: number;
}

/** Pure rule: min of focal requests clamped to `[WORLD_PACE_MIN, 1]`; 1 when none. (Time Stop → 0 is applied by the manager.) */
export function computeWorldPace(focalRequests: readonly number[]): number {
    let pace = 1;
    for (const r of focalRequests) if (r < pace) pace = r;
    if (pace === 1) return 1;
    return Math.max(WORLD_PACE_MIN, pace);
}

export class TimeManager {
    /** World seconds per tick ÷ FIXED_DT. Resolved at the start of each tick. */
    worldPace = 1;
    timeStops: TimeStop[] = [];
    private nextTimeStopSeq = 0;

    /** Single entry point to start a Time Stop (duration clamped). `currentTick` = `engine.gameTick`. */
    startTimeStop(spec: StartTimeStopSpec, currentTick: number): TimeStop {
        const seconds = Math.min(MAX_TIME_STOP_TICK_SECONDS, Math.max(0, spec.durationTickSeconds));
        const stop: TimeStop = {
            id: `timestop_${this.nextTimeStopSeq++}`,
            sourceActorId: spec.sourceActorId ?? null,
            startTick: currentTick,
            durationTicks: Math.max(1, Math.round(seconds / FIXED_DT)),
            exemptActorIds: [...(spec.exemptActorIds ?? [])],
            exemptRate: spec.exemptRate ?? 1,
            ...(spec.frozenHitPolicy !== undefined ? { frozenHitPolicy: spec.frozenHitPolicy } : {}),
        };
        this.timeStops.push(stop);
        return stop;
    }

    /** Single entry point to end a Time Stop early. Returns the removed stop, if any. */
    endTimeStop(id: string): TimeStop | undefined {
        const i = this.timeStops.findIndex((s) => s.id === id);
        if (i < 0) return undefined;
        return this.timeStops.splice(i, 1)[0];
    }

    get isTimeStopActive(): boolean {
        return this.timeStops.length > 0;
    }

    /** Remove stops that have run their tick-time duration before `tickToRun`. Returns the ended stops. */
    expireTimeStops(tickToRun: number): TimeStop[] {
        if (this.timeStops.length === 0) return [];
        const ended = this.timeStops.filter((s) => tickToRun - s.startTick > s.durationTicks);
        if (ended.length > 0) this.timeStops = this.timeStops.filter((s) => !ended.includes(s));
        return ended;
    }

    /**
     * Resolve `worldPace` for the tick about to run: expire stops, then 0 while any stop is active,
     * else the focal rule. Returns the ended stops (for events).
     */
    resolveWorldPace(focalRequests: readonly number[], tickToRun: number): TimeStop[] {
        const ended = this.expireTimeStops(tickToRun);
        this.worldPace = this.timeStops.length > 0 ? 0 : computeWorldPace(focalRequests);
        return ended;
    }

    private getExemptStop(actorId: string): TimeStop | undefined {
        for (const s of this.timeStops) if (s.exemptActorIds.includes(actorId)) return s;
        return undefined;
    }

    /**
     * The frozen-hit policy a Time Stop imposes on a (frozen) actor, or undefined when no active stop that
     * freezes it defines one. Exempt actors are not frozen by that stop.
     */
    getFrozenHitPolicy(actorId: string): FrozenHitPolicy | undefined {
        for (const s of this.timeStops) {
            if (s.frozenHitPolicy !== undefined && !s.exemptActorIds.includes(actorId)) return s.frozenHitPolicy;
        }
        return undefined;
    }

    /**
     * Per-tick multiplier of FIXED_DT for an actor: `worldPace × tempo`, or `exemptRate × tempo`
     * for Time-Stop-exempt actors. `tempo` defaults to 1 until actors carry tempo (Step 3).
     */
    getStepRate(actor: { id: string }, tempo = 1): number {
        if (this.timeStops.length > 0) {
            const stop = this.getExemptStop(actor.id);
            return stop ? stop.exemptRate * tempo : 0;
        }
        return this.worldPace === 1 ? tempo : this.worldPace * tempo;
    }

    /** True when state equals a fresh manager (used to omit it from JSON/fingerprints). */
    isDefault(): boolean {
        return this.worldPace === 1 && this.timeStops.length === 0 && this.nextTimeStopSeq === 0;
    }

    toJSON(): SerializedTimeManager {
        return {
            worldPace: this.worldPace,
            timeStops: this.timeStops.map((s) => ({ ...s, exemptActorIds: [...s.exemptActorIds] })),
            nextTimeStopSeq: this.nextTimeStopSeq,
        };
    }

    /** Restore in place (GameState owns a readonly instance). */
    restoreFromJSON(data: SerializedTimeManager | null | undefined): void {
        this.worldPace = data?.worldPace ?? 1;
        this.timeStops = (data?.timeStops ?? []).map((s) => ({ ...s, exemptActorIds: [...s.exemptActorIds] }));
        this.nextTimeStopSeq = data?.nextTimeStopSeq ?? 0;
    }

    static fromJSON(data: SerializedTimeManager | null | undefined): TimeManager {
        const tm = new TimeManager();
        tm.restoreFromJSON(data);
        return tm;
    }
}
