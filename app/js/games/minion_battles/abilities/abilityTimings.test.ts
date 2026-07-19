import { describe, expect, it } from 'vitest';
import {
    AbilityPhase,
    activeTimingIds,
    buildPrimaryTimelineSegments,
    computeTickElapsed,
    elapsedIsInCoopCooldown,
    enteredTimingIds,
    exitedTimingIds,
    getTotalAbilityDuration,
    getTotalAbilityDurationForCast,
    getTotalAbilityDurationFromIntervals,
    getTrackTargetCutoffElapsed,
    normalizeAbilityTimingsToIntervals,
    normalizeLegacyAbilityTimings,
    resolveAbilityTimingEntries,
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

    it('detects start=0 interval entry on first cast tick (prevElapsed=0)', () => {
        const startZero = [
            { id: 'active', start: 0, end: 0.1, abilityPhase: AbilityPhase.Active },
        ];
        const entered = enteredTimingIds(0, 1 / 60, startZero);
        expect(entered.has('active')).toBe(true);
    });

    it('does not re-enter when prevElapsed equals interval start (throw rock active at 0.3)', () => {
        const throwRockLike = [
            { id: 'windup', start: 0, end: 0.3, abilityPhase: AbilityPhase.Windup },
            { id: 'active', start: 0.3, end: 0.4, abilityPhase: AbilityPhase.Active },
        ];
        const dt = 1 / 60;
        const firstCross = enteredTimingIds(0.3 - dt, 0.3, throwRockLike);
        expect(firstCross.has('active')).toBe(true);
        const secondTick = enteredTimingIds(0.3, 0.3 + dt, throwRockLike);
        // Raw enteredTimingIds re-fires at prev===start; unitAbilityTick dedupes onSetup.
        expect(secondTick.has('active')).toBe(true);
    });

    it('detects knock active entry at t=0.25 stepping at 1/60', () => {
        const knockLike = [
            { id: 'windup', start: 0, end: 0.25, abilityPhase: AbilityPhase.Windup },
            { id: 'active', start: 0.25, end: 0.35, abilityPhase: AbilityPhase.Active },
            { id: 'cooldown', start: 0.35, end: 1.3, abilityPhase: AbilityPhase.Cooldown },
        ];
        const intervals = normalizeAbilityTimingsToIntervals(knockLike);
        const dt = 1 / 60;
        let activeEntries = 0;
        for (let step = 1; step <= 20; step++) {
            const next = step * dt;
            const prev = next - dt;
            const entered = enteredTimingIds(prev, next, intervals);
            if ([...entered].some((id) => id.includes('active'))) activeEntries++;
        }
        // First crossing + one duplicate at prev===start (deduped in unitAbilityTick).
        expect(activeEntries).toBe(2);
    });
});

describe('computeTickElapsed (lookahead vs real-tick call-site parity)', () => {
    const dt = 1 / 60;

    /**
     * Simulates the two call-site patterns side by side: the pre-tick lookahead
     * (selectTargetLookahead.ts) computes `computeTickElapsed(gameTime + dt, ...)` BEFORE
     * gameTime advances; the real tick (unitAbilityTick.ts) computes
     * `computeTickElapsed(gameTime, ...)` AFTER it advances. Both must agree bit-for-bit
     * at every step, and the fake 'active' interval must be detected as entered.
     */
    function stepAndCheckParity(duration: number, maxSteps: number): number {
        const intervals = normalizeAbilityTimingsToIntervals([
            { id: 'w', start: 0, end: duration, abilityPhase: AbilityPhase.Windup },
            { id: 'a', start: duration, end: duration + dt, abilityPhase: AbilityPhase.Active },
        ]);
        const startTime = 0;
        let gameTime = startTime;
        let activeEntries = 0;

        for (let step = 1; step <= maxSteps; step++) {
            const lookahead = computeTickElapsed(gameTime + dt, dt, startTime);
            gameTime += dt;
            const real = computeTickElapsed(gameTime, dt, startTime);

            expect(lookahead.nextElapsed).toBe(real.nextElapsed);
            expect(lookahead.prevElapsed).toBe(real.prevElapsed);

            if (enteredTimingIds(real.prevElapsed, real.nextElapsed, intervals).has('a')) {
                activeEntries++;
            }
        }
        return activeEntries;
    }

    // Durations reached via the SAME repeated-`+= dt` accumulation GameEngine.fixedUpdate
    // uses for gameTime — n * dt (single multiplication) can land a couple of ULPs off the
    // accumulated value, which would make the 1-tick-wide interval window fall *between*
    // two sweep steps for reasons unrelated to computeTickElapsed itself. n = 1..120 covers
    // up to 2s — well past Protect's historical 6-tick / 0.1s failure and any plausible
    // windup/active/cooldown length.
    function accumulatedTicksElapsed(n: number): number {
        let t = 0;
        for (let i = 0; i < n; i++) t += dt;
        return t;
    }
    const alignedTickCounts = Array.from({ length: 120 }, (_, i) => i + 1);

    it.each(alignedTickCounts)(
        'prevElapsed/nextElapsed agree bit-for-bit for aligned duration n=%i ticks',
        (n) => {
            const activeEntries = stepAndCheckParity(accumulatedTicksElapsed(n), n + 2);
            // The interval must be detected as entering at least once (one crossing, plus
            // occasionally a duplicate at prev===start — see the "knock active entry" test
            // above). The parity assertions inside stepAndCheckParity are the actual
            // regression guard for this sweep.
            expect(activeEntries).toBeGreaterThanOrEqual(1);
        },
    );

    // Non-tick-aligned durations for contrast — these never land exactly on a step
    // boundary, exercising the "ordinary" floating case alongside the aligned sweep above.
    it.each([0.05, 0.137, 1 / 3, 2.5])(
        'prevElapsed/nextElapsed agree bit-for-bit for non-aligned duration %f',
        (duration) => {
            const activeEntries = stepAndCheckParity(duration, Math.ceil(duration / dt) + 3);
            expect(activeEntries).toBeGreaterThanOrEqual(1);
        },
    );
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

describe('resolveAbilityTimingEntries / getTotalAbilityDurationForCast', () => {
    it('uses getAbilityTimings when provided', () => {
        const ability = {
            id: 'dyn',
            abilityTimings: [{ id: 'a', start: 0, end: 1, abilityPhase: AbilityPhase.Windup }],
            getAbilityTimings: () => [
                { id: 'b', start: 0, end: 2.5, abilityPhase: AbilityPhase.Active },
            ],
        };
        expect(resolveAbilityTimingEntries(ability)).toEqual(ability.getAbilityTimings());
        expect(getTotalAbilityDuration(ability)).toBe(1);
        expect(getTotalAbilityDurationForCast(ability)).toBe(2.5);
    });
});

describe('getTrackTargetCutoffElapsed', () => {
    // Two Active-phase intervals so the labelled one ('strike2') survives applyCoopTailSplit
    // unchanged (its own end defines the tail boundary) — see coop tail split tests below for
    // why a plain trailing Cooldown interval id would not survive normalization intact.
    const intervals = [
        { id: 'windup', start: 0, end: 0.6, abilityPhase: AbilityPhase.Windup },
        { id: 'strike', start: 0.6, end: 0.7, abilityPhase: AbilityPhase.Active },
        { id: 'strike2', start: 0.7, end: 0.8, abilityPhase: AbilityPhase.Active },
    ];

    it('falls back to prefireTime when trackTargetUntilLabel is unset', () => {
        const ability = { id: 'x', abilityTimings: intervals, prefireTime: 0.6 };
        expect(getTrackTargetCutoffElapsed(ability)).toBe(0.6);
    });

    it('falls back to prefireTime when the labelled interval is not found', () => {
        const ability = {
            id: 'x',
            abilityTimings: intervals,
            prefireTime: 0.6,
            trackTargetUntilLabel: 'no_such_label',
        };
        expect(getTrackTargetCutoffElapsed(ability)).toBe(0.6);
    });

    it('resolves to the start of the labelled interval when found', () => {
        const ability = {
            id: 'x',
            abilityTimings: intervals,
            prefireTime: 0.6,
            trackTargetUntilLabel: 'strike2',
        };
        expect(getTrackTargetCutoffElapsed(ability)).toBe(0.7);
    });

    it('resolves against getAbilityTimings when provided (per-cast override)', () => {
        const ability = {
            id: 'x',
            abilityTimings: intervals,
            prefireTime: 0.6,
            trackTargetUntilLabel: 'cooldown',
            getAbilityTimings: () => [
                { id: 'windup', start: 0, end: 1, abilityPhase: AbilityPhase.Windup },
                { id: 'cooldown', start: 1, end: 2, abilityPhase: AbilityPhase.Cooldown },
            ],
        };
        expect(getTrackTargetCutoffElapsed(ability)).toBe(1);
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
    it('places legacy rows after cursor then applies coop tail split on recovery', () => {
        const entries = [
            { id: 'a', start: 0, end: 1, abilityPhase: AbilityPhase.Active },
            { duration: 0.5, abilityPhase: AbilityPhase.Cooldown },
        ];
        const out = normalizeAbilityTimingsToIntervals(entries);
        expect(out[0]).toMatchObject({ start: 0, end: 1, abilityPhase: AbilityPhase.Active });
        expect(getTotalAbilityDurationFromIntervals(out)).toBe(1.5);
        expect(out.some((i) => i.abilityPhase === AbilityPhase.CoopCooldown)).toBe(true);
        expect(out.find((i) => i.start === 1 && i.end === 1.25)?.abilityPhase).toBe(AbilityPhase.Cooldown);
        expect(out.find((i) => i.start === 1.25 && i.end === 1.5)?.abilityPhase).toBe(AbilityPhase.CoopCooldown);
    });
});

describe('coop tail split + elapsedIsInCoopCooldown', () => {
    it('elapsedIsInCoopCooldown respects earliest-declared winner on overlap', () => {
        const intervals = normalizeAbilityTimingsToIntervals([
            { id: 'w', start: 0, end: 0.2, abilityPhase: AbilityPhase.Windup },
            { id: 'x', start: 0.2, end: 0.3, abilityPhase: AbilityPhase.Active },
            { id: 'y', start: 0.3, end: 1.6, abilityPhase: AbilityPhase.Cooldown },
        ]);
        expect(elapsedIsInCoopCooldown(1.4, intervals)).toBe(true);
        expect(elapsedIsInCoopCooldown(0.5, intervals)).toBe(false);
    });

    it('timeline exposes coopCooldown phase id on terminal tail', () => {
        const intervals = normalizeAbilityTimingsToIntervals([
            { id: 'w', start: 0, end: 0.2, abilityPhase: AbilityPhase.Windup },
            { id: 'x', start: 0.2, end: 0.3, abilityPhase: AbilityPhase.Active },
            { id: 'y', start: 0.3, end: 1.6, abilityPhase: AbilityPhase.Cooldown },
        ]);
        const merged = buildPrimaryTimelineSegments(intervals);
        expect(merged.some((s) => s.phaseId === 'coopCooldown')).toBe(true);
    });
});
