import { describe, expect, it } from 'vitest';
import {
    AbilityPhase,
    activeTimingIds,
    buildPrimaryTimelineSegments,
    enteredTimingIds,
    exitedTimingIds,
    getTotalAbilityDuration,
    getTotalAbilityDurationFromIntervals,
    normalizeAbilityTimingsToIntervals,
    normalizeLegacyAbilityTimings,
} from './abilityTimings';

describe('normalizeLegacyAbilityTimings', () => {
    it('produces sequential half-open intervals whose max end equals sum of durations', () => {
        const legacy = [
            { duration: 0.25, abilityPhase: AbilityPhase.Windup },
            { duration: 0.25, abilityPhase: AbilityPhase.Active },
            { duration: 1.0, abilityPhase: AbilityPhase.Cooldown },
        ];
        const intervals = normalizeLegacyAbilityTimings(legacy);
        expect(intervals.map((i) => i.start)).toEqual([0, 0.25, 0.5]);
        expect(intervals.map((i) => i.end)).toEqual([0.25, 0.5, 1.5]);
        expect(getTotalAbilityDurationFromIntervals(intervals)).toBe(1.5);
    });
});

describe('activeTimingIds (half-open)', () => {
    const intervals = [
        { id: 'a', start: 0, end: 1, abilityPhase: AbilityPhase.Windup },
        { id: 'b', start: 1, end: 2, abilityPhase: AbilityPhase.Active },
    ];

    it('treats elapsed === end as inactive', () => {
        expect(activeTimingIds(1, intervals).has('a')).toBe(false);
        expect(activeTimingIds(1, intervals).has('b')).toBe(true);
    });

    it('includes start boundary', () => {
        expect(activeTimingIds(0, intervals).has('a')).toBe(true);
    });
});

describe('enteredTimingIds / exitedTimingIds', () => {
    const intervals = [
        { id: 'w', start: 0, end: 0.3, abilityPhase: AbilityPhase.Windup },
        { id: 'c', start: 0.3, end: 1, abilityPhase: AbilityPhase.Cooldown },
    ];

    it('detects crossing into second interval', () => {
        const entered = enteredTimingIds(0.2, 0.31, intervals);
        expect(entered.has('c')).toBe(true);
        expect(entered.has('w')).toBe(false);
    });

    it('detects exit at end boundary', () => {
        const exited = exitedTimingIds(0.29, 0.3, intervals);
        expect(exited.has('w')).toBe(true);
    });
});

describe('getTotalAbilityDuration', () => {
    it('uses max(end) when intervals overlap', () => {
        const ability = {
            id: 'test',
            abilityTimings: [
                { id: 'x', start: 0, end: 3, abilityPhase: AbilityPhase.Windup },
                { id: 'y', start: 2, end: 4, abilityPhase: AbilityPhase.Active },
            ],
        };
        expect(getTotalAbilityDuration(ability)).toBe(4);
    });

    it('throws when abilityTimings is empty', () => {
        expect(() =>
            getTotalAbilityDuration({ id: 'empty', abilityTimings: [] }),
        ).toThrow(/non-empty abilityTimings/);
    });
});

describe('buildPrimaryTimelineSegments (first-listed wins on overlap)', () => {
    it('picks earlier-declared interval for overlap region', () => {
        const intervals = [
            { id: 'first', start: 0, end: 2, abilityPhase: AbilityPhase.Windup },
            { id: 'second', start: 1, end: 3, abilityPhase: AbilityPhase.Active },
        ];
        const merged = buildPrimaryTimelineSegments(intervals);
        const overlap = merged.find((s) => s.start === 1 && s.end === 2);
        expect(overlap?.sourceId).toBe('first');
        expect(overlap?.abilityPhase).toBe(AbilityPhase.Windup);
    });
});

describe('normalizeAbilityTimingsToIntervals (mixed)', () => {
    it('places legacy rows after cursor updated by prior explicit intervals', () => {
        const entries = [
            { id: 'a', start: 0, end: 1, abilityPhase: AbilityPhase.Active },
            { duration: 0.5, abilityPhase: AbilityPhase.Cooldown },
        ];
        const out = normalizeAbilityTimingsToIntervals(entries);
        expect(out[1].start).toBe(1);
        expect(out[1].end).toBe(1.5);
    });
});
