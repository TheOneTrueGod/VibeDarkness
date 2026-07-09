/** Shared CI status shape written by `npm run ci` and served from `/api/admin/ci-status`. */

export interface CiStatus {
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    nextScheduledAt: string;
    sourceFingerprint?: string;
    skipped?: boolean;
    lastSkippedAt?: string;
    running?: boolean;
    testsPassed: number;
    testsFailed: number;
    failedTestNames: string[];
    lintErrors: number;
    typescriptErrors: number;
}

export type CiPillVariant = 'waiting' | 'pass' | 'fail';

export function getCiPillVariant(status: CiStatus | null | undefined): CiPillVariant {
    if (status == null || status.running) {
        return 'waiting';
    }
    if (status.testsFailed > 0 || status.lintErrors > 0 || status.typescriptErrors > 0) {
        return 'fail';
    }
    return 'pass';
}

export function getCiPillTooltip(status: CiStatus | null | undefined): string {
    if (status == null) {
        return 'Waiting for Data...';
    }
    if (status.running) {
        return 'CI run in progress…';
    }
    if (status.testsFailed > 0 || status.lintErrors > 0 || status.typescriptErrors > 0) {
        return [
            `${status.testsFailed} test failures`,
            `${status.lintErrors} lint error${status.lintErrors === 1 ? '' : 's'}`,
            `${status.typescriptErrors} typescript error${status.typescriptErrors === 1 ? '' : 's'}`,
        ].join('\n');
    }
    return `${status.testsPassed} tests passed`;
}
