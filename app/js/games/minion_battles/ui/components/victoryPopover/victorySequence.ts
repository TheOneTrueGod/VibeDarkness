/**
 * Pure timeline for the victory popover (no React, no timers): objectives cross off, the title fades in,
 * Hunger converts to HP, the remaining rewards appear, then Continue.
 */

export type VictoryTimedStage = 'objectives' | 'title' | 'conversion' | 'rewards' | 'continue';
export type VictoryStage = VictoryTimedStage | 'done';

/** Stage order; each stage's content stays visible once reached. */
export const VICTORY_STAGE_ORDER: readonly VictoryTimedStage[] = [
    'objectives',
    'title',
    'conversion',
    'rewards',
    'continue',
];

/** Normal-speed length (ms) of each stage. The whole sequence stays under one second. */
export const VICTORY_STAGE_DURATIONS_MS: Record<VictoryTimedStage, number> = {
    objectives: 200,
    title: 120,
    conversion: 500,
    rewards: 100,
    continue: 60,
};

/** Playback speed when the "Fast victory sequence" setting is on. */
export const VICTORY_SEQUENCE_FAST_SPEED_MULTIPLIER = 3;

/** Stagger between objective rows being crossed off (ms, normal speed). */
export const VICTORY_OBJECTIVE_STAGGER_MS = 60;

/**
 * Length (ms, normal speed) of the Hunger to HP bar animation and the hunger icons' flight. Deliberately longer than
 * the `conversion` stage: the rewards and Continue arrive on schedule while it keeps playing.
 */
export const VICTORY_CONVERSION_ANIMATION_MS = 5000;

/** Conversion animation length for the current speed; 0 (final state at once) for reduced motion. */
export function victoryConversionAnimationMs(speedMultiplier: number, reducedMotion: boolean): number {
    if (reducedMotion) return 0;
    const speed = Number.isFinite(speedMultiplier) && speedMultiplier > 0 ? speedMultiplier : 1;
    return VICTORY_CONVERSION_ANIMATION_MS / speed;
}

/** Number of hunger icons flown from the Hunger bar to the HP bar. */
export const VICTORY_CONVERSION_ICON_COUNT = 7;

export interface VictoryTimelineOptions {
    hasObjectives: boolean;
    hasConversion: boolean;
    /** 1 = normal; larger plays faster. */
    speedMultiplier: number;
    reducedMotion: boolean;
}

export interface VictoryTimelineEntry {
    stage: VictoryTimedStage;
    startMs: number;
    durationMs: number;
}

/**
 * Ordered stages with start offsets. Stages with nothing to show are skipped (no time);
 * reduced motion collapses every duration to 0 so the final state shows immediately.
 */
export function buildVictoryTimeline(opts: VictoryTimelineOptions): VictoryTimelineEntry[] {
    const speed = Number.isFinite(opts.speedMultiplier) && opts.speedMultiplier > 0 ? opts.speedMultiplier : 1;
    const entries: VictoryTimelineEntry[] = [];
    let cursor = 0;
    for (const stage of VICTORY_STAGE_ORDER) {
        if (stage === 'objectives' && !opts.hasObjectives) continue;
        if (stage === 'conversion' && !opts.hasConversion) continue;
        const durationMs = opts.reducedMotion ? 0 : VICTORY_STAGE_DURATIONS_MS[stage] / speed;
        entries.push({ stage, startMs: cursor, durationMs });
        cursor += durationMs;
    }
    return entries;
}

export function victorySequenceTotalMs(timeline: readonly VictoryTimelineEntry[]): number {
    const last = timeline[timeline.length - 1];
    return last ? last.startMs + last.durationMs : 0;
}

/** True once `current` has reached (or passed) `stage`. */
export function hasReachedStage(current: VictoryStage, stage: VictoryTimedStage): boolean {
    if (current === 'done') return true;
    return VICTORY_STAGE_ORDER.indexOf(current) >= VICTORY_STAGE_ORDER.indexOf(stage);
}

/** Stage whose window contains `elapsedMs` (`done` after the last one). */
export function stageAtElapsed(timeline: readonly VictoryTimelineEntry[], elapsedMs: number): VictoryStage {
    for (const entry of timeline) {
        if (elapsedMs < entry.startMs + entry.durationMs) return entry.stage;
    }
    return 'done';
}
