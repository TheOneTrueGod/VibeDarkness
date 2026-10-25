/** Commit and restore-to-mark paths for InteractiveTargetingSession (rollback + in-place). */

import type { BattleOrder } from '../types';
import type { BattleSession } from '../BattleSession';
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
    opts?: { applyHeldRemoteOrders?: boolean },
): Promise<void> {
    if (!its.mark) return;
    const diagFromEngineTick = session.getEngineTick();
    // Capture-frame signal for the DOM rewind overlay (must fire before engine teardown).
    const presentationDone = session.emitSequentialTargetingRewind();
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

    await session.refreshRemoteOrdersBeforeInteractiveTargetingAction();

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
    const wouldInPlace = its.wouldCommitInPlace(session);

    // Mark batch may be stale if the host advanced during preview (lobby F6E500).
    if (!batchSubmittable || !expectedToAct) {
        const logSnapshot = its._captureLogSnapshot(session);
        const heldForAbort = [...its.heldRemoteOrders.values()];
        its.heldRemoteOrders.clear();
        await itsRestoreToMark(its, session, { applyHeldRemoteOrders: false });
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

    const collected = { ...its.collectedTargets };
    const selectLabels = [...its._selectLabels];
    // The preview cast ended early (interrupt / fizzle / death): commit that timeline, listing
    // the picks it never reached. Read before any rollback restore replaces the engine.
    const endedEarlyEngine = session.getEngine();
    const missingSelectLabels =
        endedEarlyEngine != null && its.getPreviewCastEndedEarly(endedEarlyEngine) != null
            ? selectLabels.filter((label) => !(label in collected))
            : [];
    const movementByLabel = Object.keys(its.collectedMovementByLabel).length > 0
        ? { ...its.collectedMovementByLabel }
        : undefined;
    const positionalTargetsOverride =
        selectLabels.length === 1 && its._orderPositionalTargets.length > 0
            ? [...its._orderPositionalTargets]
            : undefined;
    const baseOrder = its.originalOrder;
    const inPlace = wouldInPlace;
    const heldRows = [...its.heldRemoteOrders.values()];
    its.heldRemoteOrders.clear();

    // Always finalized: a conditional-cancel pause reached during preview is its own later
    // batch, so the follow-up never shares the mark batch (lobby E27AE2).
    const realOrder = buildFinalizedSequentialTargetingOrder(
        selectLabels,
        collected,
        baseOrder,
        movementByLabel,
        positionalTargetsOverride,
        { missingSelectLabels },
    );

    if (inPlace) {
        registerHeldPurePassDedupeKeys(session, heldRows);
        await itsCommitInPlace(its, session, {
            realOrder,
            atTick,
            unitId,
            abilityId,
            logSnapshot: its._captureLogSnapshot(session),
            actionSource,
        });
        return;
    }

    const rollbackLogSnapshot = its._captureLogSnapshot(session);

    // --- Phase 2 (rollback): restore, wait for crossfade, clear, release, submit ---

    await itsRestoreToMark(its, session, { applyHeldRemoteOrders: false });
    its._clearActive(session);

    const engine = session.getEngine();
    if (!engine) return;

    // Drop any stale pending row for this unit at the batch tick before submitting.
    engine.pendingOrders = engine.pendingOrders.filter(
        (o) => !(o.gameTick === atTick && o.order.unitId === unitId),
    );

    session.applyHeldRemoteOrders(heldRows);

    const landed = await session.submitCommittedTargetingOrder(realOrder, atTick);

    // --- Phase 3: verify the order actually landed ---
    if (!landed) {
        session.emitOrderSubmitFailed(unitId, abilityId);
        logItsPreviewEnded(session, rollbackLogSnapshot, 'rejected', 'submit_failed', {
            atTick,
            commitMode: 'rollback',
            actionSource: actionSource ?? null,
        });
        return;
    }
    session.getInteractionManager()?.clearNonconfirmedOrder();
    logItsPreviewEnded(session, rollbackLogSnapshot, 'submitted', 'rollback', {
        atTick,
        commitMode: 'rollback',
        actionSource: actionSource ?? null,
    });
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
        engine.commitDroppedItsPreviewPauseForStopTick();
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
