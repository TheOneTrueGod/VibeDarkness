import { describe, expect, it } from 'vitest';
import {
    VICTORY_CONVERSION_ANIMATION_MS,
    VICTORY_SEQUENCE_FAST_SPEED_MULTIPLIER,
    buildVictoryTimeline,
    victoryConversionAnimationMs,
    hasReachedStage,
    stageAtElapsed,
    victorySequenceTotalMs,
} from './victorySequence';

const full = { hasObjectives: true, hasConversion: true, speedMultiplier: 1, reducedMotion: false };

describe('buildVictoryTimeline', () => {
    it('orders every stage back to back and stays under one second', () => {
        const timeline = buildVictoryTimeline(full);
        expect(timeline.map((e) => e.stage)).toEqual(['objectives', 'title', 'conversion', 'rewards', 'continue']);
        timeline.forEach((entry, i) => {
            if (i > 0) expect(entry.startMs).toBe(timeline[i - 1].startMs + timeline[i - 1].durationMs);
        });
        expect(victorySequenceTotalMs(timeline)).toBeLessThan(1000);
    });

    it('skips stages with nothing to show', () => {
        const timeline = buildVictoryTimeline({ ...full, hasObjectives: false, hasConversion: false });
        expect(timeline.map((e) => e.stage)).toEqual(['title', 'rewards', 'continue']);
        expect(timeline[0].startMs).toBe(0);
    });

    it('plays the fast setting at a third of the time', () => {
        const normal = victorySequenceTotalMs(buildVictoryTimeline(full));
        const fast = victorySequenceTotalMs(
            buildVictoryTimeline({ ...full, speedMultiplier: VICTORY_SEQUENCE_FAST_SPEED_MULTIPLIER }),
        );
        expect(fast).toBeCloseTo(normal / 3);
    });

    it('takes no time under reduced motion', () => {
        expect(victorySequenceTotalMs(buildVictoryTimeline({ ...full, reducedMotion: true }))).toBe(0);
    });

    it('treats a non-positive speed as normal speed', () => {
        const normal = victorySequenceTotalMs(buildVictoryTimeline(full));
        expect(victorySequenceTotalMs(buildVictoryTimeline({ ...full, speedMultiplier: 0 }))).toBe(normal);
    });
});

describe('stage helpers', () => {
    it('reports the stage at an elapsed time and done afterwards', () => {
        const timeline = buildVictoryTimeline(full);
        expect(stageAtElapsed(timeline, 0)).toBe('objectives');
        expect(stageAtElapsed(timeline, victorySequenceTotalMs(timeline))).toBe('done');
    });

    it('hasReachedStage is monotonic', () => {
        expect(hasReachedStage('title', 'objectives')).toBe(true);
        expect(hasReachedStage('title', 'rewards')).toBe(false);
        expect(hasReachedStage('done', 'continue')).toBe(true);
    });
});

describe('victoryConversionAnimationMs', () => {
    it('outlasts the sequence, so Continue shows while the food is still flying', () => {
        const sequenceMs = victorySequenceTotalMs(buildVictoryTimeline(full));
        expect(victoryConversionAnimationMs(1, false)).toBe(VICTORY_CONVERSION_ANIMATION_MS);
        expect(victoryConversionAnimationMs(1, false)).toBeGreaterThan(sequenceMs);
    });

    it('speeds up with the fast setting and is instant with reduced motion', () => {
        expect(victoryConversionAnimationMs(VICTORY_SEQUENCE_FAST_SPEED_MULTIPLIER, false)).toBeCloseTo(
            VICTORY_CONVERSION_ANIMATION_MS / VICTORY_SEQUENCE_FAST_SPEED_MULTIPLIER,
        );
        expect(victoryConversionAnimationMs(1, true)).toBe(0);
    });
});
