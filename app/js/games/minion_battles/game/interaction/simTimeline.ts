/**
 * SimTimeline — ownership model for the interactive sequential targeting (ITS) preview timeline.
 *
 * A timeline is either canonical (the live simulation) or a preview (a speculative
 * forward simulation). When a preview is promoted, it becomes the new canonical timeline
 * and retains the same engine instance and tick (no rollback). When discarded, we
 * rewind to the mark snapshot.
 *
 * This state is owned by BattleSession and accessed by InteractiveTargetingSession
 * for state transitions.
 */

/**
 * Canonical timeline (live simulation).
 * - `engineEpoch` increments when the engine instance is replaced.
 */
export interface CanonicalTimeline {
    readonly kind: 'canonical';
    readonly engineEpoch: number;
}

/**
 * Preview timeline (speculative forward simulation).
 * - `runId` uniquely identifies this preview run (allocated at begin()).
 * - `engineEpoch` is the epoch of the preview engine when it was created.
 * - `markTick` is the engine tick at which the mark snapshot was taken.
 * - `batchAtTick` is the tick where the preview started (when order pause was detected).
 */
export interface PreviewTimeline {
    readonly kind: 'preview';
    readonly runId: number;
    readonly engineEpoch: number;
    readonly markTick: number;
    readonly batchAtTick: number;
}

export type SimTimeline = CanonicalTimeline | PreviewTimeline;

/**
 * Exhaustive match on timeline kind; throws if a new variant is added.
 * Use in switches that must handle all cases.
 */
export function assertNever(x: never): never {
    throw new Error(`Unexpected timeline kind: ${x}`);
}

/**
 * Enter a preview timeline from canonical.
 * Throws if already in a preview.
 */
export function enterPreview(
    t: SimTimeline,
    opts: { runId: number; markTick: number; batchAtTick: number },
): PreviewTimeline {
    if (t.kind === 'preview') {
        throw new Error(
            `enterPreview: already in preview (runId=${t.runId}). Cannot nest previews.`,
        );
    }
    return {
        kind: 'preview',
        runId: opts.runId,
        engineEpoch: t.engineEpoch,
        markTick: opts.markTick,
        batchAtTick: opts.batchAtTick,
    };
}

/**
 * Promote a preview to canonical (in-place commit).
 * Keeps the same engine instance and tick. Throws if not in a preview.
 */
export function toCanonical(t: SimTimeline): CanonicalTimeline {
    if (t.kind === 'canonical') {
        throw new Error(
            'toCanonical: already canonical. Cannot promote a canonical timeline.',
        );
    }
    return {
        kind: 'canonical',
        engineEpoch: t.engineEpoch,
    };
}

/**
 * Increment the engine epoch (used when the engine instance is replaced).
 */
export function bumpEpoch(t: SimTimeline): SimTimeline {
    return {
        ...t,
        engineEpoch: t.engineEpoch + 1,
    };
}

/**
 * Get the timeline kind from a BattleSessionHandle, preferring getTimeline() and falling back
 * to isInteractiveTargetingPreviewActive() for test mocks that don't implement getTimeline.
 */
export function getTimelineKind(
    session: { getTimeline?(): SimTimeline | undefined; isInteractiveTargetingPreviewActive?(): boolean },
): 'canonical' | 'preview' {
    const timeline = session.getTimeline?.();
    if (timeline?.kind === 'preview') return 'preview';
    if (session.isInteractiveTargetingPreviewActive?.()) return 'preview';
    return 'canonical';
}
