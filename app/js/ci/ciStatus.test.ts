import { describe, expect, it } from 'vitest';
import { getCiPillTooltip, getCiPillVariant } from './ciStatus';
import type { CiStatus } from './ciStatus';

const BASE_STATUS: CiStatus = {
    startedAt: '2026-07-08T12:00:00.000Z',
    finishedAt: '2026-07-08T12:05:00.000Z',
    durationMs: 300_000,
    nextScheduledAt: '2026-07-08T12:35:00.000Z',
    testsPassed: 42,
    testsFailed: 0,
    failedTestNames: [],
    lintErrors: 0,
    typescriptErrors: 0,
};

describe('getCiPillVariant', () => {
    it('returns waiting when status is missing', () => {
        expect(getCiPillVariant(null)).toBe('waiting');
    });

    it('returns waiting while a run is in progress', () => {
        expect(getCiPillVariant({ ...BASE_STATUS, running: true })).toBe('waiting');
    });

    it('returns pass when all checks are clean', () => {
        expect(getCiPillVariant(BASE_STATUS)).toBe('pass');
    });

    it('returns fail when any check category has errors', () => {
        expect(getCiPillVariant({ ...BASE_STATUS, testsFailed: 1 })).toBe('fail');
        expect(getCiPillVariant({ ...BASE_STATUS, lintErrors: 2 })).toBe('fail');
        expect(getCiPillVariant({ ...BASE_STATUS, typescriptErrors: 1 })).toBe('fail');
    });
});

describe('getCiPillTooltip', () => {
    it('shows the waiting message when there is no data', () => {
        expect(getCiPillTooltip(null)).toBe('Waiting for Data...');
    });

    it('shows pass count on green state', () => {
        expect(getCiPillTooltip(BASE_STATUS)).toBe('42 tests passed');
    });

    it('shows one line per failure category on red state', () => {
        const tooltip = getCiPillTooltip({
            ...BASE_STATUS,
            testsFailed: 3,
            lintErrors: 1,
            typescriptErrors: 0,
        });
        expect(tooltip).toBe('3 test failures\n1 lint error\n0 typescript errors');
    });
});
