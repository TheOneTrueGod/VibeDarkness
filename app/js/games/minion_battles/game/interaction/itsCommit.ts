/** Commit and restore-to-mark paths for InteractiveTargetingSession (rollback + in-place). */

import type { BattleOrder } from '../types';
import type { BattleSession, SequentialTargetingRewindReason } from '../BattleSession';
import { getAbility } from '../../abilities/AbilityRegistry';
import { isPreviewCastConditionalCancelPaused } from './isITSPreviewComplete';
import { type ItsActionSource, type ItsLogSnapshot, logItsPreviewEnded } from './itsLobbyLog';
import {
    type HeldRemoteOrder,
    buildFinalizedSequentialTargetingOrder,
    isPurePassOrder,
} from './itsOrderBuilders';
import type { InteractiveTargetingSession } from './InteractiveTargetingSession';

/**
 * Restore engine to `mark` state, wait for the rewind crossfade (when the UI defers it),
 * then apply held remote orders. Held-order / replay resume stays gated until presentation ends.
 */
export async function itsRestoreToMark(
    its: InteractiveTargetingSession,
    session: BattleSession,
    opts?: { applyHeldRemoteOrders?: boolean; reason?: SequentialTargetingRewindReason },
): Promise<void> {
    if (!its.mark) return;
    const diagFromEngineTick = session.getEngineTick();
    // Capture-frame signal for the DOM rewind overlay (must fire before engine teardown).
    const presentationDone = session.emitSequentialTargetingRewind(opts?.reason ?? 'rollback');
    // Discard preview timeline if one is active (use owned previewRunId, not session's current timeline).
    if (its.previewRunId !== null) {
        const timeline = session.getTimeline();
        if (timeline.kind === 'preview') {
            session.discardPreview(its.previewRunId);
        }
    }
    // Always restore from mark (unconditional).
    // Clone again so GameEngine.fromJSON / applySerializedUnitState cannot alias or mutate
    // nested mark fields (activeAbilities, aiContext) for the next replay.
    session.restoreFromInMemorySnapshot(structuredClone(its.mark));
    its.diagRestoreSeq++;
    its.diagLastRestore = {
        seq: its.diagRestoreSeq,
        fromEngineTick: diagFromEngineTick,
        toEngineTick: session.getEngineTick(),
        markTick: typeof its.mark.gameTick === 'number' ? its.mark.gameTick : null,
        markBatchAtTick: its.mark.waitingForOrders?.atTick ?? null,
        atMs: Date.now(),
    };
    session.postBattleSyncLobbyLog('diag: ITS restoreToMark', {
        its: its.getDiagState(),
        opts: opts ?? null,
        engineWaitingForOrdersAtTick: session.getEngine()?.waitingForOrders?.atTick ?? null,
        enginePendingOrderCount: session.getEngine()?.pendingOrders.length ?? null,
    });
    // Hold ticks under the fading overlay even if the mark was not order-paused.
    const engine = session.getEngine();
    if (engine) {
        engine.isPaused = true;
    }
    await presentationDone;
    const applyHeld = opts?.applyHeldRemoteOrders !== false;
    if (applyHeld) {
        const rows = [...its.heldRemoteOrders.values()];
        its.heldRemoteOrders.clear();
        session.applyHeldRemoteOrders(rows);
    }
    // Re-bind the saved callback (was set to null; restoreFromInMemorySnapshot re-binds
    // via bindEngineCallbacks → setOnParallelBatchResolved, so nothing to do here).
}

export async function itsCommitImpl(
    its: InteractiveTargetingSession,
    session: BattleSession,
    actionSource?: ItsActionSource,
): Promise<void> {
    if (!its._abilityId || !its._unitId || !its.mark || !its.originalOrder) return;

    // --- Phase 1: validate everything BEFORE touching engine or session state ---

    const abilityId = its._abilityId;
    const unitId = its._unitId;
    const markSnapshot = its.mark;
    const baseOrder = its.originalOrder;

    // atTick must be present in the mark snapshot.
    const markAtTick = markSnapshot.waitingForOrders?.atTick;
    if (markAtTick == null) return;

    // Ability def must exist (guard against a hot-reload removing it mid-preview).
    const ability = getAbility(abilityId);
    if (!ability) return;

    // Caster must be alive in the mark snapshot's unit list.
    const casterInSnapshot = markSnapshot.units.some(
        (u) => (u as { id?: unknown }).id === unitId,
    );
    if (!casterInSnapshot) return;

    const refresh = session.refreshRemoteOrdersBeforeInteractiveTargetingAction();
    // In-place ruled out now stays ruled out: the refresh can only add held remote rows. Rollback is
    // then certain, so the rewind (and its crossfade) runs while the refresh is in flight. Commit
    // inputs are read first, while the preview engine is still live.
    const rollbackCertain = !its.wouldCommitInPlace(session);
    const preRestoreInputs = rollbackCertain ? captureCommitInputs(its, session) : null;
    if (rollbackCertain) {
        // Start the restore after a microtask: commit can run inside an engine tick (terminal-outcome
        // auto-commit), and the engine must not be replaced while that tick is still running.
        const restore = Promise.resolve().then(() =>
            itsRestoreToMark(its, session, { applyHeldRemoteOrders: false, reason: 'turn_committed' }),
        );
        await Promise.all([refresh, restore]);
    } else {
        await refresh;
    }

    // Host may advance one batch while non-host preview freezes on gameTick+1 (lobby 8AF2AB).
    let atTick = markAtTick;
    const heartbeatBatch = session.getHeartbeatOrderBatchAtTick();
    if (
        heartbeatBatch != null
        && heartbeatBatch !== markAtTick
        && !session.isOrderBatchTickSubmittable(markAtTick)
        && session.isOrderBatchTickSubmittable(heartbeatBatch)
    ) {
        atTick = heartbeatBatch;
    }

    const batchSubmittable = session.isOrderBatchTickSubmittable(atTick);
    const expectedToAct = session.isLocalPlayerExpectedToAct();

    // Mark batch may be stale if the host advanced during preview (lobby F6E500).
    if (!batchSubmittable || !expectedToAct) {
        const logSnapshot = preRestoreInputs?.logSnapshot ?? its._captureLogSnapshot(session);
        const heldForAbort = takeHeldRemoteOrders(its);
        if (!rollbackCertain) {
            await itsRestoreToMark(its, session, { applyHeldRemoteOrders: false });
            heldForAbort.push(...takeHeldRemoteOrders(its));
        }
        session.applyHeldRemoteOrders(heldForAbort);
        its._clearActive(session);
        session.emitOrderSubmitFailed(unitId, abilityId);
        logItsPreviewEnded(session, logSnapshot, 'rejected', 'stale_batch', {
            atTick,
            batchSubmittable,
            expectedToAct,
            actionSource: actionSource ?? null,
        });
        return;
    }

    const inputs = preRestoreInputs ?? captureCommitInputs(its, session);
    const heldRows = takeHeldRemoteOrders(its);

    // Always finalized: a conditional-cancel pause reached during preview is its own later
    // batch, so the follow-up never shares the mark batch (lobby E27AE2).
    const realOrder = buildFinalizedSequentialTargetingOrder(
        inputs.selectLabels,
        inputs.collected,
        baseOrder,
        inputs.movementByLabel,
        inputs.positionalTargetsOverride,
        { missingSelectLabels: inputs.missingSelectLabels },
    );

    if (!rollbackCertain && its.wouldCommitInPlace(session)) {
        registerHeldPurePassDedupeKeys(session, heldRows);
        await itsCommitInPlace(its, session, {
            realOrder,
            atTick,
            unitId,
            abilityId,
            logSnapshot: inputs.logSnapshot,
            actionSource,
        });
        return;
    }

    // --- Phase 2 (rollback): restore, wait for crossfade, clear, release, submit ---

    if (!rollbackCertain) {
        await itsRestoreToMark(its, session, { applyHeldRemoteOrders: false, reason: 'turn_committed' });
        heldRows.push(...takeHeldRemoteOrders(its));
    }
    its._clearActive(session);

    const engine = session.getEngine();
    if (!engine) return;

    // Drop any stale pending row for this unit at the batch tick before submitting.
    engine.pendingOrders = engine.pendingOrders.filter(
        (o) => !(o.gameTick === atTick && o.order.unitId === unitId),
    );

    session.applyHeldRemoteOrders(heldRows);

    // BattleNet.submitOrder applies the order locally (optimistic / host apply-first) before its
    // first await, so the turn is settled here. Server confirmation finishes in the background:
    // the commit (and the turn spinner) does not wait for the POST or the host's merge.
    const submitted = session.submitCommittedTargetingOrder(realOrder, atTick);
    void submitted.then(
        (landed) => reportRollbackSubmit(session, landed, { unitId, abilityId, atTick, actionSource }, inputs.logSnapshot),
        (err: unknown) => {
            console.error('[ITS] rollback commit submit failed', err);
            reportRollbackSubmit(session, false, { unitId, abilityId, atTick, actionSource }, inputs.logSnapshot);
        },
    );
}

/** Phase 3 (background): report whether the rollback commit's order actually landed. */
function reportRollbackSubmit(
    session: BattleSession,
    landed: boolean,
    ctx: { unitId: string; abilityId: string; atTick: number; actionSource?: ItsActionSource },
    logSnapshot: ItsLogSnapshot,
): void {
    const { unitId, abilityId, atTick, actionSource } = ctx;
    if (!landed) {
        session.emitOrderSubmitFailed(unitId, abilityId);
        logItsPreviewEnded(session, logSnapshot, 'rejected', 'submit_failed', {
            atTick,
            commitMode: 'rollback',
            actionSource: actionSource ?? null,
        });
        return;
    }
    session.getInteractionManager()?.clearNonconfirmedOrder();
    logItsPreviewEnded(session, logSnapshot, 'submitted', 'rollback', {
        atTick,
        commitMode: 'rollback',
        actionSource: actionSource ?? null,
    });
}

interface ItsCommitInputs {
    collected: InteractiveTargetingSession['collectedTargets'];
    selectLabels: string[];
    missingSelectLabels: string[];
    movementByLabel: InteractiveTargetingSession['collectedMovementByLabel'] | undefined;
    positionalTargetsOverride: InteractiveTargetingSession['_orderPositionalTargets'] | undefined;
    logSnapshot: ItsLogSnapshot;
}

/** Everything the finalized order needs from the preview. Read before any rollback restore. */
function captureCommitInputs(its: InteractiveTargetingSession, session: BattleSession): ItsCommitInputs {
    const collected = { ...its.collectedTargets };
    const selectLabels = [...its._selectLabels];
    // The preview cast ended early (interrupt / fizzle / death): commit that timeline, listing
    // the picks it never reached.
    const engine = session.getEngine();
    const missingSelectLabels =
        engine != null && its.getPreviewCastEndedEarly(engine) != null
            ? selectLabels.filter((label) => !(label in collected))
            : [];
    return {
        collected,
        selectLabels,
        missingSelectLabels,
        movementByLabel: Object.keys(its.collectedMovementByLabel).length > 0
            ? { ...its.collectedMovementByLabel }
            : undefined,
        positionalTargetsOverride:
            selectLabels.length === 1 && its._orderPositionalTargets.length > 0
                ? [...its._orderPositionalTargets]
                : undefined,
        logSnapshot: its._captureLogSnapshot(session),
    };
}

/** Removes and returns the remote orders held during the preview. */
function takeHeldRemoteOrders(its: InteractiveTargetingSession): HeldRemoteOrder[] {
    const rows = [...its.heldRemoteOrders.values()];
    its.heldRemoteOrders.clear();
    return rows;
}

async function itsCommitInPlace(
    its: InteractiveTargetingSession,
    session: BattleSession,
    ctx: {
        realOrder: BattleOrder;
        atTick: number;
        unitId: string;
        abilityId: string;
        logSnapshot: ItsLogSnapshot;
        actionSource?: ItsActionSource;
    },
): Promise<void> {
    const { realOrder, atTick, unitId, abilityId, logSnapshot, actionSource } = ctx;

    // Mint the commit token before persisting the order. This token gates the POST during preview,
    // signifying "this order IS the promotion's order".
    const commitToken = its.previewRunId !== null ? session.mintCommitToken?.(its.previewRunId) : null;
    const engineBeforePersist = session.getEngine();
    const tickBeforePersist = engineBeforePersist?.gameTick ?? null;
    const pausedBeforePersist = engineBeforePersist?.isPaused ?? null;
    const persisted = await session.persistInPlaceCommittedTargetingOrder(realOrder, atTick, commitToken);
    if (!persisted) {
        session.emitOrderSubmitFailed(unitId, abilityId);
        logItsPreviewEnded(session, logSnapshot, 'rejected', 'persist_failed', {
            atTick,
            commitMode: 'in_place',
            actionSource: actionSource ?? null,
        });
        return;
    }

    const engine = session.getEngine();
    if (!engine) return;

    const tickAfterPersist = engine.gameTick;
    const pausedAfterPersist = engine.isPaused;
    const preserveConditionalCancelPause = isPreviewCastConditionalCancelPaused(engine);

    // Promote preview timeline to canonical (order already persisted by caller).
    if (its.previewRunId !== null) {
        const timeline = session.getTimeline();
        if (timeline.kind === 'preview') {
            session.promotePreview(its.previewRunId);
        }
    }

    engine.waitingForTargetInput = null;
    if (!preserveConditionalCancelPause) {
        engine.isPaused = false;
    }

    its._clearActive(session);

    if (preserveConditionalCancelPause) {
        // Keep the preview's own pause plane (gameTick + 1). Promotion flushes the preview
        // checkpoint, so the host tail is already past the mark batch (lobby E27AE2).
        session.emitWaitingForOrdersIfPaused();
    } else {
        // Playahead dropped the parallel pause formed on the stop tick; a canonical replay commits
        // it at the end of that tick, so form it here rather than one tick late on resume.
        const formed = engine.commitDroppedItsPreviewPauseForStopTick();
        // Record why the dropped stop-tick pause was or was not formed (P0.16 diagnostics, plan 0003).
        session.postBattleSyncLobbyLog('diag: ITS in-place dropped-pause commit', {
            formed,
            ...engine.getLastDroppedPauseCommitDiag(),
            tickBeforePersist,
            tickAfterPersist,
            pausedBeforePersist,
            pausedAfterPersist,
            waitingForOrdersAtTick: engine.waitingForOrders?.atTick ?? null,
            atTick,
        }, engine.gameTick);
    }

    session.reemitSuppressedTerminalOutcome(engine);

    // Turn is confirmed for this batch — do not leave the ability as a nonconfirmed
    // UI order (right-click would re-submit it on the next pause plane).
    session.getInteractionManager()?.clearNonconfirmedOrder();

    logItsPreviewEnded(session, logSnapshot, 'submitted', 'in_place', {
        atTick,
        commitMode: 'in_place',
        actionSource: actionSource ?? null,
    });
}

/** Register dedupe keys for held pure-pass rows without re-queueing (assumed wait already ran). */
function registerHeldPurePassDedupeKeys(session: BattleSession, heldRows: HeldRemoteOrder[]): void {
    const keys: string[] = [];
    for (const { order, key } of heldRows) {
        if (!isPurePassOrder(order)) continue;
        if (key != null) keys.push(key);
    }
    if (keys.length > 0) {
        session.seedRemoteOrderDedupeKeys(keys);
    }
}
