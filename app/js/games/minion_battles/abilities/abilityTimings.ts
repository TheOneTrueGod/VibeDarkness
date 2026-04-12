/**
 * Ability phase timings and colors for UI (e.g. segmented cooldown ring).
 * Supports legacy sequential `{ duration, abilityPhase }` rows and half-open
 * intervals `[start, end)` with stable `id` for overlap and simulation hooks.
 */

/** Phase of an ability's execution (for segment coloring). */
export enum AbilityPhase {
    Windup = 'windup',
    Active = 'active',
    Cooldown = 'cooldown',
    Iframe = 'iframe',
    Juggernaut = 'juggernaut',
}

/**
 * Legacy sequential segment: interpreted as non-overlapping blocks in declaration order.
 */
export interface AbilityTiming {
    duration: number;
    abilityPhase: AbilityPhase;
}

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
    return out;
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

export type BattleTimelinePhaseId = 'startup' | 'active' | 'iFrame' | 'cooldown';

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

/** Colors for each phase in the circular progress indicator. */
export const ABILITY_PHASE_COLORS: Record<AbilityPhase, string> = {
    [AbilityPhase.Windup]: '#f97316', // orange
    [AbilityPhase.Active]: '#ef4444', // red
    [AbilityPhase.Cooldown]: '#eab308', // yellow
    [AbilityPhase.Iframe]: '#ffffff', // white
    [AbilityPhase.Juggernaut]: '#d1d5db', // light gray
};
