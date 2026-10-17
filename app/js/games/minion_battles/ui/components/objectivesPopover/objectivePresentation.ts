/**
 * Pure presentation logic for the mission objectives popover (no React, no timers, no engine access).
 *
 * The UI diffs successive objective-row snapshots and feeds the result to `objectivesPopoverReducer`; a hook
 * advances phases by dispatching `phaseElapsed` after `OBJECTIVES_POPOVER_TIMINGS[phase]` ms.
 */

/**
 * Set false to disable the objectives popover entirely; battle UI falls back to the plain sidebar panel.
 * When false the reducer never leaves `hidden`, `playVictory()` resolves immediately and nothing is portaled.
 */
export const OBJECTIVES_POPOVER_ENABLED = true;

export interface ObjectivePresentationRow {
    id: string;
    label: string;
    completed: boolean;
}

export interface ObjectiveRowsDiff {
    newlyCompleted: string[];
    newlyRevealed: string[];
    removed: string[];
}

export type ObjectivesPopoverPhase =
    | 'hidden'
    | 'intro'
    | 'docking'
    | 'docked'
    | 'expanding'
    | 'checking'
    | 'sliding'
    | 'revealing'
    | 'victoryCrossing'
    | 'victoryText'
    | 'fadingOut';

/** Duration (ms) of each phase before `phaseElapsed` should be dispatched. `hidden`/`intro`/`docked` are untimed. */
export const OBJECTIVES_POPOVER_TIMINGS: Record<ObjectivesPopoverPhase, number> = {
    hidden: 0,
    intro: 0,
    docking: 500,
    docked: 0,
    expanding: 400,
    checking: 500,
    sliding: 450,
    revealing: 450,
    victoryCrossing: 900,
    victoryText: 900,
    fadingOut: 700,
};

export interface ObjectivesPopoverState {
    phase: ObjectivesPopoverPhase;
    /** Rows as presented (includes rows mid-slide). */
    displayRows: ObjectivePresentationRow[];
    /** Latest known real rows. */
    latestRows: ObjectivePresentationRow[];
    /** Diff driving the sequence currently playing (null when none). */
    activeDiff: ObjectiveRowsDiff | null;
    /** Changes that arrived mid-sequence, coalesced into the next sequence. */
    pendingDiff: ObjectiveRowsDiff | null;
    /**
     * Rows already taken off the list: slid out by a finished sequence, or already complete when the popover first
     * saw them. They never come back, so the victory cross-off only shows what is still open.
     */
    dismissedIds: string[];
}

export type ObjectivesPopoverAction =
    | { type: 'showIntro'; rows: ObjectivePresentationRow[] }
    | { type: 'start' }
    /** Intro not shown (resumed battle, already dismissed, opted out): go straight to docked. */
    | { type: 'skipIntro'; rows: ObjectivePresentationRow[] }
    | { type: 'objectivesChanged'; diff: ObjectiveRowsDiff; rows: ObjectivePresentationRow[] }
    | { type: 'victory' }
    | { type: 'phaseElapsed' }
    | { type: 'rebaseline'; rows: ObjectivePresentationRow[] };

export const initialObjectivesPopoverState: ObjectivesPopoverState = {
    phase: 'hidden',
    displayRows: [],
    latestRows: [],
    activeDiff: null,
    pendingDiff: null,
    dismissedIds: [],
};

export function diffObjectiveRows(
    prev: readonly ObjectivePresentationRow[],
    next: readonly ObjectivePresentationRow[],
): ObjectiveRowsDiff {
    const prevById = new Map(prev.map((r) => [r.id, r]));
    const nextIds = new Set(next.map((r) => r.id));
    const newlyCompleted: string[] = [];
    const newlyRevealed: string[] = [];
    for (const row of next) {
        const before = prevById.get(row.id);
        if (!before) {
            newlyRevealed.push(row.id);
        } else if (row.completed && !before.completed) {
            newlyCompleted.push(row.id);
        }
    }
    const removed = prev.filter((r) => !nextIds.has(r.id)).map((r) => r.id);
    return { newlyCompleted, newlyRevealed, removed };
}

export function isDiffEmpty(diff: ObjectiveRowsDiff): boolean {
    return diff.newlyCompleted.length === 0 && diff.newlyRevealed.length === 0 && diff.removed.length === 0;
}

function mergeUnique(a: string[], b: string[]): string[] {
    return [...a, ...b.filter((id) => !a.includes(id))];
}

function mergeDiffs(a: ObjectiveRowsDiff | null, b: ObjectiveRowsDiff): ObjectiveRowsDiff {
    if (!a) {
        return b;
    }
    return {
        newlyCompleted: mergeUnique(a.newlyCompleted, b.newlyCompleted),
        newlyRevealed: mergeUnique(a.newlyRevealed, b.newlyRevealed),
        removed: mergeUnique(a.removed, b.removed),
    };
}

function withoutDismissed(rows: ObjectivePresentationRow[], dismissedIds: string[]): ObjectivePresentationRow[] {
    if (dismissedIds.length === 0) {
        return rows;
    }
    const dismissed = new Set(dismissedIds);
    return rows.filter((r) => !dismissed.has(r.id));
}

function completedIdsOf(rows: ObjectivePresentationRow[]): string[] {
    return rows.filter((r) => r.completed).map((r) => r.id);
}

const SEQUENCE_PHASES: ObjectivesPopoverPhase[] = ['expanding', 'checking', 'sliding', 'revealing'];
const VICTORY_PHASES: ObjectivesPopoverPhase[] = ['victoryCrossing', 'victoryText', 'fadingOut'];

export function isVictoryPhase(phase: ObjectivesPopoverPhase): boolean {
    return VICTORY_PHASES.includes(phase);
}

export function isSequencePhase(phase: ObjectivesPopoverPhase): boolean {
    return SEQUENCE_PHASES.includes(phase);
}

/** Rows as they were before the diff happened (revealed rows absent, newly completed rows unticked). */
function rowsBeforeDiff(latest: ObjectivePresentationRow[], diff: ObjectiveRowsDiff): ObjectivePresentationRow[] {
    const revealed = new Set(diff.newlyRevealed);
    const completedNow = new Set(diff.newlyCompleted);
    return latest
        .filter((r) => !revealed.has(r.id))
        .map((r) => (completedNow.has(r.id) ? { ...r, completed: false } : r));
}

function rowsForPhase(
    phase: ObjectivesPopoverPhase,
    latest: ObjectivePresentationRow[],
    diff: ObjectiveRowsDiff,
): ObjectivePresentationRow[] {
    const completedNow = new Set(diff.newlyCompleted);
    switch (phase) {
        case 'checking':
        case 'sliding':
            // Newly completed rows are ticked but stay visible (they slide out during `sliding`).
            return rowsBeforeDiff(latest, diff).map((r) => (completedNow.has(r.id) ? { ...r, completed: true } : r));
        case 'revealing':
            return latest.filter((r) => !completedNow.has(r.id));
        default:
            return rowsBeforeDiff(latest, diff);
    }
}

function beginSequence(
    state: ObjectivesPopoverState,
    diff: ObjectiveRowsDiff,
    latest: ObjectivePresentationRow[],
): ObjectivesPopoverState {
    return {
        ...state,
        phase: 'expanding',
        activeDiff: diff,
        pendingDiff: null,
        latestRows: latest,
        displayRows: rowsForPhase('expanding', withoutDismissed(latest, state.dismissedIds), diff),
    };
}

function nextSequencePhase(state: ObjectivesPopoverState): ObjectivesPopoverPhase {
    const diff = state.activeDiff;
    const hasReveal = !!diff && diff.newlyRevealed.length > 0;
    switch (state.phase) {
        case 'expanding':
            if (diff && diff.newlyCompleted.length > 0) {
                return 'checking';
            }
            return hasReveal ? 'revealing' : 'docking';
        case 'checking':
            return 'sliding';
        case 'sliding':
            return hasReveal ? 'revealing' : 'docking';
        default:
            return 'docking';
    }
}

export function objectivesPopoverReducer(
    state: ObjectivesPopoverState,
    action: ObjectivesPopoverAction,
): ObjectivesPopoverState {
    if (!OBJECTIVES_POPOVER_ENABLED) {
        return state;
    }
    switch (action.type) {
        case 'showIntro':
            if (state.phase !== 'hidden') {
                return state;
            }
            return {
                ...initialObjectivesPopoverState,
                phase: 'intro',
                displayRows: withoutDismissed(action.rows, completedIdsOf(action.rows)),
                latestRows: action.rows,
                dismissedIds: completedIdsOf(action.rows),
            };

        case 'skipIntro': {
            if (state.phase !== 'hidden') {
                return state;
            }
            const dismissedIds = completedIdsOf(action.rows);
            return {
                ...initialObjectivesPopoverState,
                phase: 'docked',
                displayRows: withoutDismissed(action.rows, dismissedIds),
                latestRows: action.rows,
                dismissedIds,
            };
        }

        case 'start':
            return state.phase === 'intro' ? { ...state, phase: 'docking' } : state;

        case 'rebaseline': {
            if (isVictoryPhase(state.phase)) {
                return state;
            }
            const keepPhase =
                state.phase === 'intro' || state.phase === 'docking' || state.phase === 'hidden'
                    ? state.phase
                    : 'docked';
            const dismissedIds = mergeUnique(state.dismissedIds, completedIdsOf(action.rows));
            return {
                ...state,
                phase: keepPhase,
                displayRows: withoutDismissed(action.rows, dismissedIds),
                latestRows: action.rows,
                activeDiff: null,
                pendingDiff: null,
                dismissedIds,
            };
        }

        case 'objectivesChanged': {
            if (isDiffEmpty(action.diff) || isVictoryPhase(state.phase)) {
                return { ...state, latestRows: action.rows };
            }
            if (state.phase === 'hidden' || state.phase === 'intro') {
                // Not showing a sequence: just keep the rows current.
                return {
                    ...state,
                    displayRows: withoutDismissed(action.rows, state.dismissedIds),
                    latestRows: action.rows,
                };
            }
            if (state.phase === 'docked') {
                return beginSequence(state, action.diff, action.rows);
            }
            // Mid-sequence (including docking): coalesce into the next sequence.
            return {
                ...state,
                latestRows: action.rows,
                pendingDiff: mergeDiffs(state.pendingDiff, action.diff),
            };
        }

        case 'victory': {
            if (isVictoryPhase(state.phase)) {
                return state;
            }
            // Only rows still on the list: the last open objective(s), even if the engine already completed them.
            const rows = withoutDismissed(
                state.latestRows.length > 0 ? state.latestRows : state.displayRows,
                state.dismissedIds,
            );
            return {
                ...state,
                phase: 'victoryCrossing',
                displayRows: rows.map((r) => ({ ...r, completed: true })),
                activeDiff: null,
                pendingDiff: null,
            };
        }

        case 'phaseElapsed': {
            switch (state.phase) {
                case 'docking':
                    if (state.pendingDiff) {
                        return beginSequence(state, state.pendingDiff, state.latestRows);
                    }
                    return {
                        ...state,
                        phase: 'docked',
                        displayRows: withoutDismissed(state.latestRows, state.dismissedIds),
                        activeDiff: null,
                    };
                case 'expanding':
                case 'checking':
                case 'sliding':
                case 'revealing': {
                    const next = state.phase === 'revealing' ? 'docking' : nextSequencePhase(state);
                    if (next === 'docking') {
                        // Sequence finished: the completed rows have slid off for good.
                        const dismissedIds = mergeUnique(state.dismissedIds, state.activeDiff?.newlyCompleted ?? []);
                        const finished = { ...state, dismissedIds };
                        // Run any coalesced changes, else fly back.
                        if (state.pendingDiff) {
                            return beginSequence(finished, state.pendingDiff, state.latestRows);
                        }
                        return {
                            ...finished,
                            phase: 'docking',
                            displayRows: withoutDismissed(state.latestRows, dismissedIds),
                            activeDiff: null,
                        };
                    }
                    return {
                        ...state,
                        phase: next,
                        displayRows: state.activeDiff
                            ? rowsForPhase(next, withoutDismissed(state.latestRows, state.dismissedIds), state.activeDiff)
                            : state.displayRows,
                    };
                }
                case 'victoryCrossing':
                    return { ...state, phase: 'victoryText' };
                case 'victoryText':
                    return { ...state, phase: 'fadingOut' };
                case 'fadingOut':
                    return { ...state, phase: 'hidden' };
                default:
                    return state;
            }
        }
    }
}

/** Total victory sequence length (ms), used by callers for timeout fallbacks. */
export function victorySequenceDurationMs(): number {
    return (
        OBJECTIVES_POPOVER_TIMINGS.victoryCrossing +
        OBJECTIVES_POPOVER_TIMINGS.victoryText +
        OBJECTIVES_POPOVER_TIMINGS.fadingOut
    );
}
