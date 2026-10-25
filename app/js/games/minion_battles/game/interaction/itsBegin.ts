/** Session start paths (begin / beginResume / replay) for InteractiveTargetingSession. */

import type { BattleOrder } from '../types';
import type { BattleSession } from '../BattleSession';
import type { GameEngine } from '../GameEngine';
import { localNow } from '../time/actorClock';
import { getInteractiveTargetDefsFromTimings } from '../../abilities/targeting';
import { getAbility } from '../../abilities/AbilityRegistry';
import { unitAbilityHasTag } from '../../abilities/abilityUses';
import { findPreviewDeferredSelectLabel } from './selectTargetLookahead';
import { type ItsActionSource, logItsButtonClick, logItsPreviewStarted } from './itsLobbyLog';
import { buildPositionalTargetsFromLabels, buildTargetsByLabelFromPositional } from './itsOrderBuilders';
import { itsRestoreToMark } from './itsCommit';
import type { InteractiveTargetingSession } from './InteractiveTargetingSession';

/** The caster's local "now" (cast `startTime` clock); the world clock when the unit is missing or has no local clock. */
function casterLocalNow(engine: GameEngine, unitId: string): number {
    const unit = engine.getUnit(unitId);
    return unit ? localNow(unit, engine.gameTime) : engine.gameTime;
}

export function itsBegin(its: InteractiveTargetingSession, order: BattleOrder, session: BattleSession): boolean {
    const engineForGate = session.getEngine();
    const batchForGate = engineForGate?.waitingForOrders;
    if (
        batchForGate != null
        && (
            !session.isOrderBatchTickSubmittable(batchForGate.atTick)
            || !session.isLocalPlayerExpectedToAct()
        )
    ) {
        return false;
    }

    const abilityId = order.abilityId;
    const unitId = order.unitId;
    const engine = session.getEngine();
    if (!engine) return false;

    const batch = engine.state.orderMgr.waitingForOrders;
    if (!batch) return false;
    if (!batch.waiters.some((w) => w.unitId === unitId)) return false;
    if (engine.state.orderMgr.hasPendingEndTurnOrderForUnit(unitId, batch.atTick)) return false;

    const ability = getAbility(abilityId);
    const caster = engine.getUnit(unitId);
    if (!ability || !caster) return false;

    // Combo / Entombed follow-up: applyOrder rejects tag-ineligible abilities, which would
    // leave the preview with no cast queued.
    const pausedCast = caster.activeAbilities.find((a) => a.conditionalCancelPaused);
    if (pausedCast?.conditionalCancelTagFilter?.some((tag) => !unitAbilityHasTag(caster, abilityId, tag))) {
        return false;
    }

    const interactiveDefs = getInteractiveTargetDefsFromTimings(ability, caster, engine);
    if (interactiveDefs.length === 0) return false;

    its._selectLabels = interactiveDefs.map((def) => def.label);

    its._isActive = true;
    its._resumeMode = false;
    its._resumeCastStartTime = null;
    its._abilityId = abilityId;
    its._unitId = unitId;
    its.originalOrder = order;
    // Clear any leftover state from a previous session.
    Object.keys(its.collectedTargets).forEach((k) => delete its.collectedTargets[k]);
    its.collectedMovementByLabel = {};
    its._orderPositionalTargets = [];
    its.heldRemoteOrders.clear();
    its._currentLabel = null;
    its._previewOrderQueued = false;
    its.assumedWaitUnitIds = new Set();
    its.assumedRemoteWaitDuringPreview = false;

    // Snapshot the pause state (include runtime fingerprint so restore does not reset to fingerprintInitial).
    // Deep-clone: engine.toJSON() embeds live refs (aiContext, abilityNote, waiters, …). Without a
    // clone, preview ticks and the first restore's fromJSON aliasing mutate the mark — later
    // replay/reset restore mid-preview AI/charge state while x/y stay at the pause (wolves
    // "teleport" after charging from the wrong place).
    const markState = structuredClone(engine.toJSON());
    markState.checkpointRuntimeFingerprintHex = engine.getRuntimeFingerprintHex();
    its.mark = markState;
    its.diagBeginSeq++;

    // Enter preview timeline through session.
    session.enterItsPreview(its.diagBeginSeq, engine.gameTick, batch.atTick);
    // Store the runId so we own it and can reject stale calls.
    its.previewRunId = its.diagBeginSeq;

    session.postBattleSyncLobbyLog('diag: ITS begin', {
        its: its.getDiagState(),
        engineTick: session.getEngineTick(),
        batchAtTick: batch.atTick,
    });

    // Flag the engine so host callbacks (checkpoint, fingerprint, batch-resolved) skip
    // during the preview run. This prevents the preview state from being persisted to the server.
    engine.isSequentialTargetingPreview = true;
    engine.sequentialTargetingPreviewCast = {
        unitId,
        abilityId,
        startRound: engine.roundNumber,
        beganAtGameTime: engine.gameTime,
        beganAtLocalTime: casterLocalNow(engine, unitId),
    };

    engine.setOnParallelBatchResolved(null);

    // Other players may not have submitted yet — queue assumed waits so the preview can advance.
    for (const waiter of batch.waiters) {
        if (waiter.unitId === unitId) continue;
        if (engine.state.orderMgr.hasPendingEndTurnOrderForUnit(waiter.unitId, batch.atTick)) {
            continue;
        }
        engine.state.orderMgr.applyOrder({
            unitId: waiter.unitId,
            abilityId: 'wait',
            targets: [],
            endTurn: true,
        });
        its.assumedWaitUnitIds.add(waiter.unitId);
        its.assumedRemoteWaitDuringPreview = true;
    }

    const deferredLabel = findPreviewDeferredSelectLabel(ability, caster, engine);

    const previewOrder: BattleOrder = {
        ...order,
        targets: [],
        targetsByLabel: {},
        endTurn: true,
    };

    if (deferredLabel != null) {
        // Cast cannot start until the first target is known (t=0 select or windup lunge).
        engine.signalWaitingForTarget(deferredLabel, unitId, abilityId);
        engine.isPaused = true;
        its._currentLabel = deferredLabel;
        logItsPreviewStarted(session, its, {
            batchAtTick: batch.atTick,
            deferredFirstLabel: deferredLabel,
        });
        return true;
    }

    // Queue the preview order. Spread the original order so movePath/moveTargetUnitId/moveTargetPixel
    // take effect during the preview windup — the caster slides toward the
    // intended destination even before targets are confirmed.
    engine.state.orderMgr.applyOrder(previewOrder);
    its._previewOrderQueued = true;
    // applyOrder → onAfterOrderQueued → tryResumeParallel → all ready → engine starts running.
    logItsPreviewStarted(session, its, {
        batchAtTick: batch.atTick,
        deferredFirstLabel: null,
    });
    return true;
}

export function itsBeginResume(its: InteractiveTargetingSession, unitId: string, session: BattleSession): boolean {
    const engine = session.getEngine();
    if (!engine) return false;
    const batch = engine.state.orderMgr.waitingForOrders;
    if (!batch) return false;
    if (!session.isOrderBatchTickSubmittable(batch.atTick) || !session.isLocalPlayerExpectedToAct()) {
        return false;
    }
    if (!batch.waiters.some((w) => w.unitId === unitId)) return false;
    if (engine.state.orderMgr.hasPendingEndTurnOrderForUnit(unitId, batch.atTick)) return false;

    const caster = engine.getUnit(unitId);
    if (!caster) return false;
    const active = caster.activeAbilities.find((a) => a.awaitingPickLabel !== undefined);
    if (!active || active.awaitingPickLabel === undefined) return false;
    const ability = getAbility(active.abilityId);
    if (!ability) return false;
    const awaitingLabel = active.awaitingPickLabel;

    // Missing labels in timing order. Falls back to the awaited label alone.
    const missing = active.missingSelectLabels ?? [awaitingLabel];
    const labels = getInteractiveTargetDefsFromTimings(ability, caster, engine)
        .map((def) => def.label)
        .filter((label) => missing.includes(label));
    its._selectLabels = labels.length > 0 ? labels : [awaitingLabel];

    its._isActive = true;
    its._resumeMode = true;
    its._resumeCastStartTime = active.startTime;
    its._abilityId = active.abilityId;
    its._unitId = unitId;
    its.originalOrder = {
        unitId,
        abilityId: active.abilityId,
        targets: [],
        endTurn: true,
        updateTargets: true,
    };
    Object.keys(its.collectedTargets).forEach((k) => delete its.collectedTargets[k]);
    its.collectedMovementByLabel = {};
    its._orderPositionalTargets = [];
    its.heldRemoteOrders.clear();
    its._currentLabel = null;
    its._previewOrderQueued = false;
    its.assumedWaitUnitIds = new Set();
    its.assumedRemoteWaitDuringPreview = false;

    // Same mark + preview timeline setup as begin().
    const markState = structuredClone(engine.toJSON());
    markState.checkpointRuntimeFingerprintHex = engine.getRuntimeFingerprintHex();
    its.mark = markState;
    its.diagBeginSeq++;
    session.enterItsPreview(its.diagBeginSeq, engine.gameTick, batch.atTick);
    its.previewRunId = its.diagBeginSeq;

    session.postBattleSyncLobbyLog('diag: ITS beginResume', {
        its: its.getDiagState(),
        engineTick: session.getEngineTick(),
        batchAtTick: batch.atTick,
        awaitingLabel,
    });

    engine.isSequentialTargetingPreview = true;
    engine.sequentialTargetingPreviewCast = {
        unitId,
        abilityId: active.abilityId,
        startRound: engine.roundNumber,
        beganAtGameTime: engine.gameTime,
        beganAtLocalTime: casterLocalNow(engine, unitId),
        resumeCastStartTime: active.startTime,
    };
    engine.setOnParallelBatchResolved(null);

    // Other waiters get an assumed wait so the preview can advance (commit then rolls back).
    for (const waiter of batch.waiters) {
        if (waiter.unitId === unitId) continue;
        if (engine.state.orderMgr.hasPendingEndTurnOrderForUnit(waiter.unitId, batch.atTick)) continue;
        engine.state.orderMgr.applyOrder({
            unitId: waiter.unitId,
            abilityId: 'wait',
            targets: [],
            endTurn: true,
        });
        its.assumedWaitUnitIds.add(waiter.unitId);
        its.assumedRemoteWaitDuringPreview = true;
    }

    // Ask for the awaited pick up front; no ticks run before it.
    engine.signalWaitingForTarget(awaitingLabel, unitId, active.abilityId);
    engine.isPaused = true;
    its._currentLabel = awaitingLabel;
    logItsPreviewStarted(session, its, {
        batchAtTick: batch.atTick,
        deferredFirstLabel: awaitingLabel,
    });
    return true;
}

export async function itsReplay(
    its: InteractiveTargetingSession,
    session: BattleSession,
    actionSource: ItsActionSource = 'ui_replay',
): Promise<void> {
    if (!its._abilityId || !its._unitId || !its.originalOrder) return;
    logItsButtonClick(session, its, actionSource);
    const unitId = its._unitId;
    const targets = { ...its.collectedTargets };
    const positionalTargets =
        its._selectLabels.length === 1 && its._orderPositionalTargets.length > 0
            ? [...its._orderPositionalTargets]
            : null;
    const movementByLabel = Object.keys(its.collectedMovementByLabel).length > 0
        ? { ...its.collectedMovementByLabel }
        : undefined;
    const baseOrder = its.originalOrder;

    await session.refreshRemoteOrdersBeforeInteractiveTargetingAction();
    await itsRestoreToMark(its, session);

    const engine = session.getEngine();
    if (!engine) return;

    // After restore, the preview timeline was discarded. Re-enter preview for the replay run.
    its.diagBeginSeq++;
    const replayBatchAtTick = its.mark?.waitingForOrders?.atTick ?? engine.gameTick;
    session.enterItsPreview(its.diagBeginSeq, engine.gameTick, replayBatchAtTick);
    // Store the new runId for this replay run.
    its.previewRunId = its.diagBeginSeq;

    // restoreFromInMemorySnapshot creates a fresh engine (isSequentialTargetingPreview = false
    // and onParallelBatchResolved re-bound to the real callback). Re-raise the flag and
    // suppress the batch callback so the replay run doesn't persist state to the server.
    engine.isSequentialTargetingPreview = true;
    engine.sequentialTargetingPreviewCast = {
        unitId,
        abilityId: baseOrder.abilityId,
        startRound: engine.roundNumber,
        beganAtGameTime: engine.gameTime,
        beganAtLocalTime: casterLocalNow(engine, unitId),
        ...(its._resumeMode && its._resumeCastStartTime != null
            ? { resumeCastStartTime: its._resumeCastStartTime }
            : {}),
    };
    engine.setOnParallelBatchResolved(null);

    // Re-queue wait for other players' units (restore wiped the auto-queued waits from begin()).
    const replayBatch = engine.state.orderMgr.waitingForOrders;
    if (replayBatch) {
        for (const waiter of replayBatch.waiters) {
            if (waiter.unitId !== unitId) {
                engine.state.orderMgr.applyOrder({
                    unitId: waiter.unitId,
                    abilityId: 'wait',
                    targets: [],
                    endTurn: true,
                });
                its.assumedRemoteWaitDuringPreview = true;
            }
        }
    }

    // Resume mode with nothing collected yet: return to the pause and ask for the awaited pick again.
    if (its._resumeMode && Object.keys(targets).length === 0) {
        const awaiting = engine.getUnit(unitId)?.activeAbilities.find((a) => a.awaitingPickLabel !== undefined);
        const awaitingLabel = awaiting?.awaitingPickLabel;
        if (awaitingLabel !== undefined) {
            its._previewOrderQueued = false;
            engine.signalWaitingForTarget(awaitingLabel, unitId, baseOrder.abilityId);
            engine.isPaused = true;
            its._currentLabel = awaitingLabel;
            return;
        }
    }

    // Re-queue with targets pre-filled — no blocking will occur.
    // Spread originalOrder so movement fields (movePath etc.) are preserved.
    // Include movementByLabel so per-label movement fires at interval entry.
    const replayTargets = positionalTargets
        ?? buildPositionalTargetsFromLabels(its._selectLabels, targets);
    const replayOrder: BattleOrder = {
        ...baseOrder,
        targets: replayTargets,
        targetsByLabel: buildTargetsByLabelFromPositional(its._selectLabels, targets, replayTargets),
        endTurn: true,
        ...(movementByLabel ? { movementByLabel } : {}),
        // Resume mode: re-queue the preview updateTargets order; the empty list hands later picks to the lookahead.
        ...(its._resumeMode ? { missingSelectLabels: [] } : {}),
    };
    engine.state.orderMgr.applyOrder(replayOrder);
}
