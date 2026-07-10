/** Fallback game ticks per pip when ability duration is unknown. */
export const DEFAULT_FRAMES_PER_PIP = 5;

/**
 * Ability duration (seconds) that maps to 1 engine frame per pip.
 * Matches Dodge (~0.4 s): short casts stay fine-grained; longer casts coarsen.
 */
export const ITS_PIP_BASELINE_DURATION_SEC = 0.4;

/** Engine fixed-step rate — one game tick per this many seconds. */
export const ENGINE_TICKS_PER_SECOND = 60;

export interface ItsTimelinePipModel {
    /** Total pips in the stepper (at least 1). */
    pipCount: number;
    /** Index of the red “current” pip, clamped to `[0, pipCount - 1]`. */
    currentPipIndex: number;
}

/**
 * Scale ticks-per-pip from cast length: shorter abilities → fewer frames per pip
 * (Dodge baseline = 1). Longer abilities pack more ticks into each pip.
 */
export function framesPerPipForAbilityDuration(durationSec: number): number {
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
        return DEFAULT_FRAMES_PER_PIP;
    }
    return Math.max(1, Math.round(durationSec / ITS_PIP_BASELINE_DURATION_SEC));
}

/**
 * Maps ITS mark / playahead ticks onto discrete pips.
 *
 * Span is the max of: ticks already seen (high water), the live current offset,
 * and an optional expected ability duration — so the bar has future pips before
 * playahead finishes, and can grow if playahead runs longer than the cast.
 */
export function computeItsTimelinePips(args: {
    startTick: number;
    currentTick: number;
    highWaterTick: number;
    expectedDurationTicks: number;
    framesPerPip?: number;
}): ItsTimelinePipModel {
    const framesPerPip = args.framesPerPip ?? DEFAULT_FRAMES_PER_PIP;
    const safePip = Math.max(1, Math.floor(framesPerPip));

    const start = args.startTick;
    const currentOffset = Math.max(0, args.currentTick - start);
    const highWaterOffset = Math.max(0, args.highWaterTick - start);
    const expected = Math.max(0, Math.floor(args.expectedDurationTicks));

    const spanTicks = Math.max(currentOffset, highWaterOffset, expected, safePip);
    const pipCount = Math.max(1, Math.ceil(spanTicks / safePip));
    const currentPipIndex = Math.min(pipCount - 1, Math.floor(currentOffset / safePip));

    return { pipCount, currentPipIndex };
}

/** Convert ability duration (seconds) to engine ticks. */
export function abilityDurationSecondsToTicks(durationSec: number): number {
    if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
    return Math.ceil(durationSec * ENGINE_TICKS_PER_SECOND);
}
