/**
 * Pure helpers for the Campaign Character `activeQuestRuns` collection (keyed by `runId`).
 * Persistence and PATCH merge live elsewhere; this module is the shared domain API.
 */

import type { QuestRunState, QuestRunStatus } from './questTypes';

export type ActiveQuestRunsMap = Record<string, QuestRunState>;

/** Statuses that count as an in-progress attempt (prep or actively playing slots). */
export const QUEST_RUN_STATUSES_PREP_OR_ACTIVE: readonly QuestRunStatus[] = ['prep', 'active'];

export function isPrepOrActiveQuestRun(run: QuestRunState): boolean {
    return run.status === 'prep' || run.status === 'active';
}

/**
 * Coerce null/undefined to `{}` and ensure each entry is stored under `run.runId`.
 * Drops entries without a `runId`.
 */
export function normalizeActiveQuestRuns(
    runs: ActiveQuestRunsMap | null | undefined,
): ActiveQuestRunsMap {
    if (!runs || typeof runs !== 'object') {
        return {};
    }
    const out: ActiveQuestRunsMap = {};
    for (const value of Object.values(runs)) {
        if (!value?.runId) continue;
        out[value.runId] = value;
    }
    return out;
}

/** Read `activeQuestRuns` from wire JSON, or wrap legacy singular `activeQuestRun`. */
export function coalesceActiveQuestRunsFromWire(data: {
    activeQuestRuns?: ActiveQuestRunsMap | null;
    activeQuestRun?: QuestRunState | null;
}): ActiveQuestRunsMap {
    if (data.activeQuestRuns != null && typeof data.activeQuestRuns === 'object') {
        return normalizeActiveQuestRuns(data.activeQuestRuns);
    }
    if (data.activeQuestRun !== undefined) {
        return legacySingularToMap(data.activeQuestRun);
    }
    return {};
}

/** Wrap legacy singular `activeQuestRun` into a map for migration and constructors. */
export function legacySingularToMap(run: QuestRunState | null | undefined): ActiveQuestRunsMap {
    if (!run?.runId) {
        return {};
    }
    return { [run.runId]: run };
}

export function findRunById(
    runs: ActiveQuestRunsMap,
    runId: string,
): QuestRunState | undefined {
    return normalizeActiveQuestRuns(runs)[runId];
}

/** First prep/active run for this quest definition, if any. */
export function findRunByQuestDefId(
    runs: ActiveQuestRunsMap,
    questDefId: string,
): QuestRunState | undefined {
    for (const run of Object.values(normalizeActiveQuestRuns(runs))) {
        if (run.questDefId === questDefId && isPrepOrActiveQuestRun(run)) {
            return run;
        }
    }
    return undefined;
}

export function listPrepOrActive(runs: ActiveQuestRunsMap): QuestRunState[] {
    return Object.values(normalizeActiveQuestRuns(runs)).filter(isPrepOrActiveQuestRun);
}

/**
 * Whether starting a new attempt is allowed: false when a prep/active run already exists
 * for this `questDefId` (callers continue that run instead).
 */
export function canStartQuestDef(runs: ActiveQuestRunsMap, questDefId: string): boolean {
    return findRunByQuestDefId(runs, questDefId) === undefined;
}

export class DuplicatePrepActiveQuestDefError extends Error {
    constructor(
        public readonly questDefId: string,
        public readonly existingRunId: string,
        public readonly attemptedRunId: string,
    ) {
        super(
            `Cannot store a second prep/active quest run for questDefId "${questDefId}" ` +
                `(existing runId "${existingRunId}", attempted "${attemptedRunId}")`,
        );
        this.name = 'DuplicatePrepActiveQuestDefError';
    }
}

/**
 * Insert or replace `run` at `run.runId`. Rejects a second prep/active run for the same
 * `questDefId` when the incoming `runId` differs from the existing one.
 */
export function upsertActiveQuestRunInMap(
    runs: ActiveQuestRunsMap,
    run: QuestRunState,
): ActiveQuestRunsMap {
    if (!run.runId) {
        throw new Error('upsertActiveQuestRunInMap requires run.runId');
    }
    const normalized = normalizeActiveQuestRuns(runs);
    if (isPrepOrActiveQuestRun(run)) {
        const existing = findRunByQuestDefId(normalized, run.questDefId);
        if (existing && existing.runId !== run.runId) {
            throw new DuplicatePrepActiveQuestDefError(run.questDefId, existing.runId, run.runId);
        }
    }
    return { ...normalized, [run.runId]: run };
}
