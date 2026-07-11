/** Engine ticks represented by each timeline pip. */
export const FRAMES_PER_PIP = 2;

/** Fixed rendered width of one pip (px). */
export const PIP_WIDTH_PX = 2;

/** Gap between adjacent pips (px); matches Tailwind `gap-px`. */
export const PIP_GAP_PX = 1;

/** Approximate width reserved for a `+N` overflow chip (px). */
export const OVERFLOW_LABEL_WIDTH_PX = 22;

/** Engine fixed-step rate — one game tick per this many seconds. */
export const ENGINE_TICKS_PER_SECOND = 60;

/** @deprecated Use {@link FRAMES_PER_PIP}. */
export const DEFAULT_FRAMES_PER_PIP = FRAMES_PER_PIP;

export interface ItsTimelinePipModel {
    /** Total logical pips for the ability/playahead span (at least 1). */
    pipCount: number;
    /** Index of the red “current” pip in the full logical span, clamped to `[0, pipCount - 1]`. */
    currentPipIndex: number;
}

export interface ItsTimelineWindowModel {
    /** First logical pip index shown in the viewport. */
    windowStart: number;
    /** How many logical pips are drawn. */
    visibleCount: number;
    /** Logical pips cut off on the left (`0` when none). */
    leftOverflow: number;
    /** Logical pips cut off on the right (`0` when none). */
    rightOverflow: number;
    /** Index of the current pip within the visible slice, or `-1` if none. */
    visibleCurrentIndex: number;
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
    const framesPerPip = args.framesPerPip ?? FRAMES_PER_PIP;
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

/**
 * How many fixed-size pips fit in `availableWidthPx` (including gaps between them).
 */
export function maxPipsForWidth(availableWidthPx: number, pipWidthPx = PIP_WIDTH_PX, gapPx = PIP_GAP_PX): number {
    if (!Number.isFinite(availableWidthPx) || availableWidthPx <= 0) return 1;
    const stride = pipWidthPx + gapPx;
    // n pips use n * pipWidth + (n - 1) * gap = n * stride - gap
    return Math.max(1, Math.floor((availableWidthPx + gapPx) / stride));
}

/**
 * Window the logical pip span into a fixed-capacity viewport.
 *
 * - Short abilities: show all pips from the left; caller leaves blank space on the right.
 * - Long abilities: clip the right with `rightOverflow`.
 * - Once the playhead passes the midpoint of a start-aligned window, keep it centered
 *   and clip the left with `leftOverflow` as needed.
 */
export function computeItsTimelineWindow(args: {
    pipCount: number;
    currentPipIndex: number;
    maxVisiblePips: number;
}): ItsTimelineWindowModel {
    const pipCount = Math.max(1, Math.floor(args.pipCount));
    const currentPipIndex = Math.min(pipCount - 1, Math.max(0, Math.floor(args.currentPipIndex)));
    const maxVisible = Math.max(1, Math.floor(args.maxVisiblePips));

    if (pipCount <= maxVisible) {
        return {
            windowStart: 0,
            visibleCount: pipCount,
            leftOverflow: 0,
            rightOverflow: 0,
            visibleCurrentIndex: currentPipIndex,
        };
    }

    const half = Math.floor(maxVisible / 2);
    let windowStart = 0;
    if (currentPipIndex > half) {
        windowStart = currentPipIndex - half;
    }
    const maxStart = pipCount - maxVisible;
    windowStart = Math.min(Math.max(0, windowStart), maxStart);

    const visibleCount = maxVisible;
    const leftOverflow = windowStart;
    const rightOverflow = pipCount - windowStart - visibleCount;
    const visibleCurrentIndex = currentPipIndex - windowStart;

    return {
        windowStart,
        visibleCount,
        leftOverflow,
        rightOverflow,
        visibleCurrentIndex,
    };
}

/**
 * Given a full track width, reserve space for overflow chips when needed and return
 * the final window. Recomputes once after discovering left/right overflow so labels
 * do not steal pip slots unexpectedly.
 */
export function computeItsTimelineWindowForWidth(args: {
    pipCount: number;
    currentPipIndex: number;
    trackWidthPx: number;
    pipWidthPx?: number;
    gapPx?: number;
    overflowLabelWidthPx?: number;
}): ItsTimelineWindowModel & { maxVisiblePips: number } {
    const pipWidthPx = args.pipWidthPx ?? PIP_WIDTH_PX;
    const gapPx = args.gapPx ?? PIP_GAP_PX;
    const labelW = args.overflowLabelWidthPx ?? OVERFLOW_LABEL_WIDTH_PX;

    const fit = (width: number) => maxPipsForWidth(width, pipWidthPx, gapPx);

    let maxVisible = fit(args.trackWidthPx);
    let window = computeItsTimelineWindow({
        pipCount: args.pipCount,
        currentPipIndex: args.currentPipIndex,
        maxVisiblePips: maxVisible,
    });

    const leftLabel = window.leftOverflow > 0 ? labelW : 0;
    const rightLabel = window.rightOverflow > 0 ? labelW : 0;
    if (leftLabel > 0 || rightLabel > 0) {
        maxVisible = fit(Math.max(0, args.trackWidthPx - leftLabel - rightLabel));
        window = computeItsTimelineWindow({
            pipCount: args.pipCount,
            currentPipIndex: args.currentPipIndex,
            maxVisiblePips: maxVisible,
        });
    }

    return { ...window, maxVisiblePips: maxVisible };
}

/** Convert ability duration (seconds) to engine ticks. */
export function abilityDurationSecondsToTicks(durationSec: number): number {
    if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
    return Math.ceil(durationSec * ENGINE_TICKS_PER_SECOND);
}
