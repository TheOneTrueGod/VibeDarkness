import { describe, it, expect } from 'vitest';
import {
    DEFAULT_FRAMES_PER_PIP,
    ENGINE_TICKS_PER_SECOND,
    ITS_PIP_BASELINE_DURATION_SEC,
    abilityDurationSecondsToTicks,
    computeItsTimelinePips,
    framesPerPipForAbilityDuration,
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

describe('framesPerPipForAbilityDuration', () => {
    it('uses 1 frame per pip at the Dodge baseline duration', () => {
        expect(framesPerPipForAbilityDuration(ITS_PIP_BASELINE_DURATION_SEC)).toBe(1);
        expect(framesPerPipForAbilityDuration(0.4)).toBe(1);
    });

    it('coarsens longer abilities proportionally', () => {
        expect(framesPerPipForAbilityDuration(0.8)).toBe(2);
        expect(framesPerPipForAbilityDuration(2.0)).toBe(5);
    });

    it('never goes below 1 frame per pip', () => {
        expect(framesPerPipForAbilityDuration(0.1)).toBe(1);
    });

    it('falls back to DEFAULT_FRAMES_PER_PIP when duration is unknown', () => {
        expect(framesPerPipForAbilityDuration(0)).toBe(DEFAULT_FRAMES_PER_PIP);
        expect(framesPerPipForAbilityDuration(-1)).toBe(DEFAULT_FRAMES_PER_PIP);
        expect(framesPerPipForAbilityDuration(Number.NaN)).toBe(DEFAULT_FRAMES_PER_PIP);
    });
});

describe('computeItsTimelinePips', () => {
    it('uses DEFAULT_FRAMES_PER_PIP when framesPerPip is omitted', () => {
        const model = computeItsTimelinePips({
            startTick: 100,
            currentTick: 100 + DEFAULT_FRAMES_PER_PIP * 3,
            highWaterTick: 100 + DEFAULT_FRAMES_PER_PIP * 3,
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
            framesPerPip: 5,
        });
        expect(model.pipCount).toBe(10);
        expect(model.currentPipIndex).toBe(0);
    });

    it('grows when high water exceeds expected duration', () => {
        const model = computeItsTimelinePips({
            startTick: 10,
            currentTick: 70,
            highWaterTick: 70,
            expectedDurationTicks: 20,
            framesPerPip: 5,
        });
        expect(model.pipCount).toBe(12);
        expect(model.currentPipIndex).toBe(11);
    });

    it('clamps the current pip to the last index at the end of the span', () => {
        const model = computeItsTimelinePips({
            startTick: 0,
            currentTick: 100,
            highWaterTick: 25,
            expectedDurationTicks: 25,
            framesPerPip: 5,
        });
        expect(model.pipCount).toBe(20);
        expect(model.currentPipIndex).toBe(19);
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

    it('with 1 frame per pip, current index tracks tick offset directly', () => {
        const model = computeItsTimelinePips({
            startTick: 0,
            currentTick: 12,
            highWaterTick: 24,
            expectedDurationTicks: 24,
            framesPerPip: 1,
        });
        expect(model.pipCount).toBe(24);
        expect(model.currentPipIndex).toBe(12);
    });
});
