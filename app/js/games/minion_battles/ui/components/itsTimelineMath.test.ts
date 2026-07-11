import { describe, it, expect } from 'vitest';
import {
    ENGINE_TICKS_PER_SECOND,
    FRAMES_PER_PIP,
    PIP_GAP_PX,
    PIP_WIDTH_PX,
    abilityDurationSecondsToTicks,
    computeItsTimelinePips,
    computeItsTimelineWindow,
    computeItsTimelineWindowForWidth,
    maxPipsForWidth,
} from './itsTimelineMath';

describe('abilityDurationSecondsToTicks', () => {
    it('converts seconds using the engine tick rate', () => {
        expect(abilityDurationSecondsToTicks(1)).toBe(ENGINE_TICKS_PER_SECOND);
        expect(abilityDurationSecondsToTicks(0.5)).toBe(ENGINE_TICKS_PER_SECOND / 2);
    });

    it('returns 0 for non-positive or non-finite durations', () => {
        expect(abilityDurationSecondsToTicks(0)).toBe(0);
        expect(abilityDurationSecondsToTicks(-1)).toBe(0);
        expect(abilityDurationSecondsToTicks(Number.NaN)).toBe(0);
    });
});

describe('computeItsTimelinePips', () => {
    it('defaults to FRAMES_PER_PIP (2 ticks per pip)', () => {
        const model = computeItsTimelinePips({
            startTick: 100,
            currentTick: 100 + FRAMES_PER_PIP * 3,
            highWaterTick: 100 + FRAMES_PER_PIP * 3,
            expectedDurationTicks: 0,
        });
        expect(model.pipCount).toBe(3);
        expect(model.currentPipIndex).toBe(2);
    });

    it('sizes the bar from expected duration before playahead advances', () => {
        const model = computeItsTimelinePips({
            startTick: 0,
            currentTick: 0,
            highWaterTick: 0,
            expectedDurationTicks: 50,
        });
        expect(model.pipCount).toBe(25);
        expect(model.currentPipIndex).toBe(0);
    });

    it('grows when high water exceeds expected duration', () => {
        const model = computeItsTimelinePips({
            startTick: 10,
            currentTick: 70,
            highWaterTick: 70,
            expectedDurationTicks: 20,
        });
        // 60 ticks / 2 = 30 pips
        expect(model.pipCount).toBe(30);
        expect(model.currentPipIndex).toBe(29);
    });

    it('honours a custom framesPerPip', () => {
        const model = computeItsTimelinePips({
            startTick: 0,
            currentTick: 9,
            highWaterTick: 9,
            expectedDurationTicks: 0,
            framesPerPip: 10,
        });
        expect(model.pipCount).toBe(1);
        expect(model.currentPipIndex).toBe(0);
    });
});

describe('maxPipsForWidth', () => {
    it('fits as many fixed pips as the track allows', () => {
        // 3 pips: 2+1+2+1+2 = 8px
        expect(maxPipsForWidth(8, PIP_WIDTH_PX, PIP_GAP_PX)).toBe(3);
        expect(maxPipsForWidth(7, PIP_WIDTH_PX, PIP_GAP_PX)).toBe(2);
    });
});

describe('computeItsTimelineWindow', () => {
    it('shows the full span when it fits, with no overflow', () => {
        expect(
            computeItsTimelineWindow({ pipCount: 10, currentPipIndex: 3, maxVisiblePips: 20 }),
        ).toEqual({
            windowStart: 0,
            visibleCount: 10,
            leftOverflow: 0,
            rightOverflow: 0,
            visibleCurrentIndex: 3,
        });
    });

    it('clips the right while the playhead is in the first half', () => {
        expect(
            computeItsTimelineWindow({ pipCount: 40, currentPipIndex: 5, maxVisiblePips: 20 }),
        ).toEqual({
            windowStart: 0,
            visibleCount: 20,
            leftOverflow: 0,
            rightOverflow: 20,
            visibleCurrentIndex: 5,
        });
    });

    it('keeps the playhead centered once past the midpoint', () => {
        // half of 20 = 10; current 15 → start at 5
        expect(
            computeItsTimelineWindow({ pipCount: 40, currentPipIndex: 15, maxVisiblePips: 20 }),
        ).toEqual({
            windowStart: 5,
            visibleCount: 20,
            leftOverflow: 5,
            rightOverflow: 15,
            visibleCurrentIndex: 10,
        });
    });

    it('clamps the window at the end of the span', () => {
        expect(
            computeItsTimelineWindow({ pipCount: 40, currentPipIndex: 39, maxVisiblePips: 20 }),
        ).toEqual({
            windowStart: 20,
            visibleCount: 20,
            leftOverflow: 20,
            rightOverflow: 0,
            visibleCurrentIndex: 19,
        });
    });
});

describe('computeItsTimelineWindowForWidth', () => {
    it('reserves label width when the right side overflows', () => {
        // Wide enough for many pips, but span is longer → right label reserved.
        const result = computeItsTimelineWindowForWidth({
            pipCount: 100,
            currentPipIndex: 0,
            trackWidthPx: 100,
        });
        expect(result.rightOverflow).toBeGreaterThan(0);
        expect(result.leftOverflow).toBe(0);
        expect(result.visibleCount).toBe(result.maxVisiblePips);
        expect(result.visibleCount).toBeLessThan(maxPipsForWidth(100));
    });
});
