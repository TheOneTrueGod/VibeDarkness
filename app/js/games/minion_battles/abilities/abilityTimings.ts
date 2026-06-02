/**
 * Ability phase timings and colors for UI (e.g. segmented cooldown ring).
 * Supports legacy sequential `{ duration, abilityPhase }` rows and half-open
 * intervals `[start, end)` with stable `id` for overlap and simulation hooks.
 */

import type { CastBehaviourEntry, CastBehaviour } from './castBehaviourTypes';
import type { TimingTargetDef } from './timingTargetDef';

/** Phase of an ability's execution (for segment coloring). */
export enum AbilityPhase {
    Windup = 'windup',
    Active = 'active',
    Cooldown = 'cooldown',
    CoopCooldown = 'coopCooldown',
    Iframe = 'iframe',
    Juggernaut = 'juggernaut',
    Waiting = 'waiting',
}

/**
 * Legacy sequential segment: interpreted as non-overlapping blocks in declaration order.
 */
export interface AbilityTiming {
    duration: number;
    abilityPhase: AbilityPhase;
}

/**
 * Declarative emitter definition for a timing window.
 * When the timing window opens the engine automatically creates and registers
 * the appropriate EffectEmitter; when it closes the emitter is deactivated.
 */
/** Fields shared across all emitter modes. */
type EmitterDefShared = {
    /**
     * Duration in seconds of each spawned Effect. Default 1.
     * Use this instead of hardcoding duration inside effectData.
     */
    effectDuration?: number;
    /**
     * When true, the engine merges { bodyColor, radius, characterSpriteKey } from the
     * caster unit into effectData at window-open time. Useful for afterimage-style trails
     * where the visual must match the specific unit running the ability.
     * Static effectData fields take precedence over auto-resolved values.
     */
    useCasterVisualData?: boolean;
};

export type AbilityTimingEmitterDef = EmitterDefShared & (
    | {
        mode: 'instant';
        /** effectType string matching an effectDefRegistry key */
        effectType: string;
        effectData?: Record<string, unknown>;
        /** Emit N copies at once. Default 1. */
        count?: number;
      }
    | {
        mode: 'interval';
        intervalSeconds: number;
        effectType: string;
        effectData?: Record<string, unknown>;
        /** Optional radius passed to Effect.effectRadius (for size-dependent visuals). */
        effectRadius?: number;
        /** When true, fires the first effect on the very first game tick (seeds accumulator). */
        fireImmediately?: boolean;
      }
    | {
        mode: 'continuous';
        effectType: string;
        effectData?: Record<string, unknown>;
        emitWhilePaused?: boolean;
        /** Emit every N render frames. Default 1. */
        emitIntervalFrames?: number;
      }
);

/**
 * Half-open interval [start, end) from ability start, seconds.
 * Declaration order matters when intervals overlap (UI merge: first-listed wins).
 */
export interface AbilityTimingInterval {
    id: string;
    start: number;
    end: number;
    abilityPhase: AbilityPhase;
    /** Optional battle timeline tooltip title (defaults from phase). */
    timelineLabel?: string;
    /** Optional battle timeline tooltip body. */
    timelineDescription?: string;
    /** Optional declarative emitter: engine auto-creates/deactivates it as this window opens/closes. */
    emitterDef?: AbilityTimingEmitterDef;
    castBehaviours?: CastBehaviourEntry[];
    /**
     * Per-timing target acquisition definition.
     * - `kind: 'select'` — the player must click to select a target using the specified hitbox.
     * - `kind: 'hit'`    — reuse a target already committed by a prior SelectTargetDef timing.
     */
    targetDef?: TimingTargetDef;
    /**
     * Shorthand for a single CastBehaviourEntry spanning the full timing window
     * (`timingStart: 'start'`, `timingEnd: 'end'`). Ignored if `castBehaviours` is also set.
     */
    behaviour?: CastBehaviour;
    /**
     * When true, the engine fires evade-break logic for the caster as soon as this
     * interval is entered. Use on the first Active/Iframe interval of any new evade ability.
     *
     * WARNING: applyCoopTailSplit creates new interval objects that do NOT preserve
     * castBehaviours, emitterDef, evadeEffect, targetDef, behaviour, or any other
     * extension fields. CoopCooldown intervals must always be last and must have no
     * behavioral effects.
     */
    evadeEffect?: boolean;
}

export type AbilityTimingEntry = AbilityTiming | AbilityTimingInterval;

export function isAbilityTimingInterval(e: AbilityTimingEntry): e is AbilityTimingInterval {
    return (
        typeof (e as AbilityTimingInterval).id === 'string' &&
        typeof (e as AbilityTimingInterval).start === 'number' &&
        typeof (e as AbilityTimingInterval).end === 'number'
    );
}

export function validateAbilityTimings(entries: AbilityTimingEntry[]): void {
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (isAbilityTimingInterval(e)) {
            if (!(e.start < e.end)) {
                throw new Error(`abilityTimings[${i}] (${e.id}): start must be < end`);
            }
            if (e.start < 0) {
                console.warn(`abilityTimings[${i}] (${e.id}): negative start`);
            }
        } else if (e.duration <= 0) {
            throw new Error(`abilityTimings[${i}]: legacy duration must be positive`);
        }
    }
}

/**
 * Converts legacy sequential rows into half-open intervals from t = 0 (no overlap).
 */
export function normalizeLegacyAbilityTimings(legacy: AbilityTiming[]): AbilityTimingInterval[] {
    let cursor = 0;
    return legacy.map((seg, i) => {
        const interval: AbilityTimingInterval = {
            id: `legacy_${i}`,
            start: cursor,
            end: cursor + seg.duration,
            abilityPhase: seg.abilityPhase,
        };
        cursor += seg.duration;
        return interval;
    });
}

/**
 * Converts a def list into absolute intervals. Explicit intervals keep their start/end;
 * legacy rows are placed sequentially from the running cursor (max with last interval end).
 */
export function normalizeAbilityTimingsToIntervals(entries: AbilityTimingEntry[]): AbilityTimingInterval[] {
    let cursor = 0;
    const out: AbilityTimingInterval[] = [];
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (isAbilityTimingInterval(e)) {
            out.push(e);
            cursor = Math.max(cursor, e.end);
        } else {
            out.push({
                id: `legacy_${i}`,
                start: cursor,
                end: cursor + e.duration,
                abilityPhase: e.abilityPhase,
            });
            cursor += e.duration;
        }
    }
    return applyCoopTailSplit(out);
}

const COOP_TAIL_SPLIT_EPS = 1e-6;

function isTailBoundaryEffectPhase(phase: AbilityPhase): boolean {
    return (
        phase === AbilityPhase.Active || phase === AbilityPhase.Juggernaut || phase === AbilityPhase.Iframe
    );
}

/**
 * WARNING: This function creates new interval objects preserving only:
 * id, start, end, abilityPhase, timelineLabel, timelineDescription.
 * Fields castBehaviours, emitterDef, evadeEffect, targetDef, behaviour, and
 * any future extension fields are NOT carried through to split intervals.
 *
 * Rule: CoopCooldown intervals must always be the last timing entries in an
 * ability, and must carry no behavioral effects (no castBehaviours, no
 * emitterDef, no evadeEffect, no targetDef, no behaviour). Any interval
 * subject to tail splitting must be free of these fields.
 */
/**
 * Second half of the terminal tail (after the last Active/Juggernaut/Iframe segment) becomes
 * {@link AbilityPhase.CoopCooldown} so coop sync can trim casts without changing total duration.
 */
export function applyCoopTailSplit(intervals: AbilityTimingInterval[]): AbilityTimingInterval[] {
    if (intervals.length === 0) return intervals;
    const T = getTotalAbilityDurationFromIntervals(intervals);
    let tailStart = -Infinity;
    for (const it of intervals) {
        if (isTailBoundaryEffectPhase(it.abilityPhase)) {
            tailStart = Math.max(tailStart, it.end);
        }
    }
    if (tailStart === -Infinity || T - tailStart <= COOP_TAIL_SPLIT_EPS) {
        return intervals;
    }
    const mid = tailStart + (T - tailStart) / 2;
    const result: AbilityTimingInterval[] = [];

    for (const it of intervals) {
        if (it.end <= tailStart + COOP_TAIL_SPLIT_EPS) {
            result.push({ ...it });
            continue;
        }
        if (it.start >= T - COOP_TAIL_SPLIT_EPS) {
            continue;
        }

        // [it.start, it.end) clipped to [0, tailStart)
        if (it.start < tailStart - COOP_TAIL_SPLIT_EPS) {
            const headEnd = Math.min(it.end, tailStart);
            if (it.start + COOP_TAIL_SPLIT_EPS < headEnd) {
                const headOnly = it.end <= tailStart + COOP_TAIL_SPLIT_EPS;
                result.push({
                    ...it,
                    end: headEnd,
                    id: headOnly ? it.id : `${it.id}_head`,
                });
            }
        }

        // Overlap [tailStart, mid) — keep original phase
        const s1 = Math.max(it.start, tailStart);
        const e1 = Math.min(it.end, mid);
        if (s1 + COOP_TAIL_SPLIT_EPS < e1) {
            const isWhole = Math.abs(it.start - s1) < COOP_TAIL_SPLIT_EPS && Math.abs(it.end - e1) < COOP_TAIL_SPLIT_EPS;
            result.push({
                id: isWhole ? it.id : `${it.id}_tailA`,
                start: s1,
                end: e1,
                abilityPhase: it.abilityPhase,
                timelineLabel: it.timelineLabel,
                timelineDescription: it.timelineDescription,
            });
        }

        // Overlap [mid, T) — coop cooldown segment(s)
        const s2 = Math.max(it.start, mid);
        const e2 = Math.min(it.end, T);
        if (s2 + COOP_TAIL_SPLIT_EPS < e2) {
            result.push({
                id: `${it.id}_cc_${s2}_${e2}`,
                start: s2,
                end: e2,
                abilityPhase: AbilityPhase.CoopCooldown,
            });
        }
    }

    return result;
}

export function getTotalAbilityDurationFromIntervals(intervals: AbilityTimingInterval[]): number {
    if (intervals.length === 0) return 0;
    let maxEnd = intervals[0].end;
    for (let i = 1; i < intervals.length; i++) {
        if (intervals[i].end > maxEnd) maxEnd = intervals[i].end;
    }
    return maxEnd;
}

/** Ids of intervals active at `elapsed` (half-open: end is exclusive). */
export function activeTimingIds(elapsed: number, intervals: AbilityTimingInterval[]): Set<string> {
    const s = new Set<string>();
    for (const it of intervals) {
        if (it.start <= elapsed && elapsed < it.end) s.add(it.id);
    }
    return s;
}

export function enteredTimingIds(
    prevElapsed: number,
    nextElapsed: number,
    intervals: AbilityTimingInterval[],
): Set<string> {
    const prev = activeTimingIds(prevElapsed, intervals);
    const next = activeTimingIds(nextElapsed, intervals);
    const out = new Set<string>();
    for (const id of next) {
        if (!prev.has(id)) out.add(id);
    }
    return out;
}

export function exitedTimingIds(
    prevElapsed: number,
    nextElapsed: number,
    intervals: AbilityTimingInterval[],
): Set<string> {
    const prev = activeTimingIds(prevElapsed, intervals);
    const next = activeTimingIds(nextElapsed, intervals);
    const out = new Set<string>();
    for (const id of prev) {
        if (!next.has(id)) out.add(id);
    }
    return out;
}

export type BattleTimelinePhaseId = 'startup' | 'active' | 'iFrame' | 'cooldown' | 'coopCooldown' | 'waiting';

export interface PrimaryTimelineSegment {
    start: number;
    end: number;
    sourceId: string;
    abilityPhase: AbilityPhase;
    phaseId: BattleTimelinePhaseId;
    label: string;
    description: string;
}

function abilityPhaseToTimelinePhaseId(phase: AbilityPhase): BattleTimelinePhaseId {
    switch (phase) {
        case AbilityPhase.Windup:
            return 'startup';
        case AbilityPhase.Active:
        case AbilityPhase.Juggernaut:
            return 'active';
        case AbilityPhase.Iframe:
            return 'iFrame';
        case AbilityPhase.Cooldown:
            return 'cooldown';
        case AbilityPhase.CoopCooldown:
            return 'coopCooldown';
        case AbilityPhase.Waiting:
            return 'waiting';
    }
}

function defaultTimelineLabel(phase: AbilityPhase): string {
    switch (phase) {
        case AbilityPhase.Windup:
            return 'Startup';
        case AbilityPhase.Active:
            return 'Active';
        case AbilityPhase.Cooldown:
            return 'Cooldown';
        case AbilityPhase.Iframe:
            return 'iFrame';
        case AbilityPhase.Juggernaut:
            return 'Juggernaut';
        case AbilityPhase.CoopCooldown:
            return 'Team cooldown';
        default:
            return 'Active';
    }
}

function defaultTimelineDescription(phase: AbilityPhase): string {
    switch (phase) {
        case AbilityPhase.Windup:
            return 'Preparing the ability.';
        case AbilityPhase.Active:
            return 'The ability is hitting or taking effect.';
        case AbilityPhase.Cooldown:
            return 'Recovering before the next action.';
        case AbilityPhase.Iframe:
            return 'Invincibility frames.';
        case AbilityPhase.Juggernaut:
            return 'Strong defensive stance.';
        case AbilityPhase.CoopCooldown:
            return 'An ally taking their turn can end this recovery early.';
        default:
            return 'The ability is active.';
    }
}

/**
 * Single horizontal band for the battle timeline: union of intervals, split at boundaries;
 * when several intervals cover the same sub-range, the earliest in declaration order wins.
 */
export function buildPrimaryTimelineSegments(intervals: AbilityTimingInterval[]): PrimaryTimelineSegment[] {
    if (intervals.length === 0) return [];

    const annotated = intervals.map((it, originalIndex) => ({ it, originalIndex }));
    const times = new Set<number>();
    for (const { it } of annotated) {
        times.add(it.start);
        times.add(it.end);
    }
    const sorted = [...times].sort((a, b) => a - b);
    const out: PrimaryTimelineSegment[] = [];

    for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        if (!(a < b)) continue;

        const covering = annotated.filter(({ it }) => it.start <= a && it.end > a);
        if (covering.length === 0) continue;

        covering.sort((x, y) => x.originalIndex - y.originalIndex);
        const { it: winner } = covering[0];
        const phaseId = abilityPhaseToTimelinePhaseId(winner.abilityPhase);
        out.push({
            start: a,
            end: b,
            sourceId: winner.id,
            abilityPhase: winner.abilityPhase,
            phaseId,
            label: winner.timelineLabel ?? defaultTimelineLabel(winner.abilityPhase),
            description:
                winner.timelineDescription ?? defaultTimelineDescription(winner.abilityPhase),
        });
    }

    return out;
}

/**
 * Visible pieces of the primary band from `elapsed` within [elapsed, elapsed + windowSeconds),
 * expressed as offsets from "now" (0 = current time).
 */
export function computeVisiblePrimarySegments(
    merged: PrimaryTimelineSegment[],
    elapsed: number,
    windowSeconds: number,
): { phaseId: BattleTimelinePhaseId; start: number; duration: number; label: string; description: string }[] {
    const segments: {
        phaseId: BattleTimelinePhaseId;
        start: number;
        duration: number;
        label: string;
        description: string;
    }[] = [];

    for (const seg of merged) {
        if (seg.end <= elapsed) continue;

        const visibleStart = Math.max(seg.start, elapsed);
        const visibleEnd = seg.end;
        const offsetFromNow = visibleStart - elapsed;

        if (offsetFromNow >= windowSeconds) continue;

        const visibleDuration = visibleEnd - visibleStart;
        const clampedDuration = Math.min(visibleDuration, windowSeconds - offsetFromNow);
        if (clampedDuration <= 0) continue;

        segments.push({
            phaseId: seg.phaseId,
            start: offsetFromNow,
            duration: clampedDuration,
            label: seg.label,
            description: seg.description,
        });
    }

    return segments;
}

/**
 * Enemy row "action" bar: first interval with Active phase in declaration order, else ids
 * hit / lunge / flight, else the first declared interval (e.g. Juggernaut-only block abilities).
 */
export function getEnemyActionWindowFromIntervals(
    intervals: AbilityTimingInterval[],
): { actionStart: number; actionEnd: number } | null {
    if (intervals.length === 0) return null;
    for (const it of intervals) {
        if (it.abilityPhase === AbilityPhase.Active) {
            return { actionStart: it.start, actionEnd: it.end };
        }
    }
    for (const it of intervals) {
        if (it.id === 'hit' || it.id === 'lunge' || it.id === 'flight') {
            return { actionStart: it.start, actionEnd: it.end };
        }
    }
    const first = intervals[0];
    return { actionStart: first.start, actionEnd: first.end };
}

/**
 * Total duration (seconds) of the ability cycle: `max(end)` of normalized `abilityTimings`.
 * Every ability must define a non-empty `abilityTimings`.
 */
/** Ability defs that may override timings per cast (e.g. research). */
export type AbilityTimingsResolvable = {
    id?: string;
    abilityTimings: AbilityTimingEntry[];
    getAbilityTimings?(caster?: unknown, gameState?: unknown): AbilityTimingEntry[];
};

export function resolveAbilityTimingEntries(
    ability: AbilityTimingsResolvable,
    caster?: unknown,
    gameState?: unknown,
): AbilityTimingEntry[] {
    return ability.getAbilityTimings?.(caster, gameState) ?? ability.abilityTimings;
}

export function getTotalAbilityDuration(ability: {
    id?: string;
    abilityTimings: AbilityTimingEntry[];
}): number {
    const entries = ability.abilityTimings;
    if (entries.length === 0) {
        throw new Error(
            `getTotalAbilityDuration: ability "${ability.id ?? 'unknown'}" must have non-empty abilityTimings`,
        );
    }
    const intervals = normalizeAbilityTimingsToIntervals(entries);
    return getTotalAbilityDurationFromIntervals(intervals);
}

/**
 * Cast duration using `getAbilityTimings(caster, gameState)` when defined, else `abilityTimings`.
 * Use in simulation (e.g. `GameEngine`) so runtime overrides match the timeline.
 */
export function getTotalAbilityDurationForCast(
    ability: AbilityTimingsResolvable,
    caster?: unknown,
    gameState?: unknown,
): number {
    const entries = resolveAbilityTimingEntries(ability, caster, gameState);
    if (entries.length === 0) {
        throw new Error(
            `getTotalAbilityDurationForCast: ability "${ability.id ?? 'unknown'}" must have non-empty resolved timings`,
        );
    }
    const intervals = normalizeAbilityTimingsToIntervals(entries);
    return getTotalAbilityDurationFromIntervals(intervals);
}

/** Colors for each phase in the circular progress indicator. */
export const ABILITY_PHASE_COLORS: Record<AbilityPhase, string> = {
    [AbilityPhase.Windup]: '#f97316', // orange
    [AbilityPhase.Active]: '#ef4444', // red
    [AbilityPhase.Cooldown]: '#eab308', // yellow
    [AbilityPhase.CoopCooldown]: '#facc15', // brighter yellow (timeline / ring)
    [AbilityPhase.Iframe]: '#ffffff', // white
    [AbilityPhase.Juggernaut]: '#d1d5db', // light gray
    [AbilityPhase.Waiting]: '#6b7280', // gray
};

/** Earliest-declared covering interval at `elapsed` wins (same as timeline merge). */
export function getCoveringAbilityPhaseAtElapsed(
    elapsed: number,
    intervals: AbilityTimingInterval[],
): AbilityPhase | null {
    let bestIdx = Number.POSITIVE_INFINITY;
    let best: AbilityPhase | null = null;
    for (let i = 0; i < intervals.length; i++) {
        const it = intervals[i];
        if (it.start <= elapsed && elapsed < it.end && i < bestIdx) {
            bestIdx = i;
            best = it.abilityPhase;
        }
    }
    return best;
}

export function elapsedIsInCoopCooldown(elapsed: number, intervals: AbilityTimingInterval[]): boolean {
    return getCoveringAbilityPhaseAtElapsed(elapsed, intervals) === AbilityPhase.CoopCooldown;
}

/**
 * Returns the effective cast behaviour entries for a timing interval.
 * Handles both the explicit `castBehaviours` array and the single-behaviour
 * `behaviour` shorthand (which is treated as a full-window entry at bIdx=0).
 *
 * The returned indices (bIdx) correspond 1-to-1 with the behaviour payload keys
 * used by unitAbilityTick: `${interval.id}_${bIdx}`.
 */
export function getEffectiveCastBehaviours(
    interval: AbilityTimingInterval,
): CastBehaviourEntry[] | undefined {
    if (interval.castBehaviours) return interval.castBehaviours;
    if (interval.behaviour) {
        return [{ timingStart: 'start', timingEnd: 'end', behaviour: interval.behaviour }];
    }
    return undefined;
}
