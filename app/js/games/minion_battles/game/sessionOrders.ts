/**
 * BattleSession order handling: remote-order apply, held-order release, local submit and the
 * in-place/rollback commit persistence paths. Pure moves out of `BattleSession`.
 */
import type { BattleOrder } from './types';
import { logToLobbyLogBattleSync } from '../../../lobbyLog';
import type { ApplyRemoteOrdersResult, RemoteOrderWireRow } from './battlenet';
import { hashOrderId } from './battlenet/helpers/orderHashing';
import { summarizeRemoteWireRowsForLog } from './battlenet/helpers/orderWireLogSummary';
import { type HeldRemoteOrder } from './interaction/InteractiveTargetingSession';
import { USE_SEQUENTIAL_TARGETING } from '../featureFlags';
import { getAbility } from '../abilities/AbilityRegistry';
import { canUseAbilityNow } from '../abilities/abilityUses';
import { getInteractiveTargetDefsFromTimings } from '../abilities/targeting';
import { isAtConditionalCancelDecision } from './interaction/isITSPreviewComplete';
import { toCanonical } from './interaction/simTimeline';
import { type CanonicalToken } from './battlenet/canonicalToken';
import type { BattleSession } from './BattleSession';

export function applyHeldRemoteOrdersFor(
    session: BattleSession,
    rows: HeldRemoteOrder[],
): void {
    const engine = session.engine;
    if (!engine) return;
    let anyQueued = false;
    for (const { atTick, order, key } of rows) {
        if (key != null && session.appliedRemoteOrderKeys.has(key)) {
            // Already applied before or during the preview — skip to prevent double-application.
            continue;
        }
        if (session.isBakedIntoLoadedState(atTick)) {
            if (key != null) session.appliedRemoteOrderKeys.add(key);
            continue;
        }
        engine.state.orderMgr.queueOrder(atTick, order);
        if (key != null) {
            session.appliedRemoteOrderKeys.add(key);
        }
        anyQueued = true;
    }
    if (anyQueued) {
        engine.tryResumeParallel();
    }
}

export function applyRemoteOrdersFor(
    session: BattleSession,
    orders: RemoteOrderWireRow[],
): ApplyRemoteOrdersResult {
    const newlyAppliedKeys: string[] = [];
    const skippedKeys: string[] = [];
    // While an interactive targeting preview is running, hold all remote orders so they
    // don't interfere with the local preview engine state. They will be applied after
    // the preview ends (commit/reset/replay all call _restoreToMark which applies held orders).
    if (session.interactiveTargeting.isActive) {
        for (const row of orders) {
            const atTick = row.atTick ?? row.gameTick;
            if (typeof atTick !== 'number' || Number.isNaN(atTick)) continue;
            const order = row.order as BattleOrder;
            const idWire = row.idHash;
            const keyFromWire = typeof idWire === 'string' && idWire.length > 0 ? idWire : null;
            const playerId = typeof row.playerId === 'string' && row.playerId.length > 0 ? row.playerId : null;
            const key =
                keyFromWire ??
                (playerId != null ? hashOrderId(playerId, atTick, order) : null);
            if (key != null && (session.appliedRemoteOrderKeys.has(key) || session.isBakedIntoLoadedState(atTick))) {
                // Already applied before the preview started (or baked into the checkpoint) — skip entirely.
                session.appliedRemoteOrderKeys.add(key);
                skippedKeys.push(key);
                continue;
            }
            session.interactiveTargeting.holdRemoteOrder(atTick, order, key);
        }
        return { newlyAppliedKeys, skippedKeys };
    }
    const eng = session.engine;
    if (!eng) {
        return { newlyAppliedKeys, skippedKeys };
    }
    const engineTickBeforeApply = eng.gameTick;
    for (const rec of orders) {
        const atTick = rec.atTick ?? rec.gameTick;
        if (typeof atTick !== 'number' || Number.isNaN(atTick)) {
            continue;
        }
        const idWire = rec.idHash;
        const keyFromWire = typeof idWire === 'string' && idWire.length > 0 ? idWire : null;
        const playerId = typeof rec.playerId === 'string' && rec.playerId.length > 0 ? rec.playerId : null;
        const key =
            keyFromWire ??
            (playerId != null ? hashOrderId(playerId, atTick, rec.order as BattleOrder) : null);
        if (key == null) {
            continue;
        }
        if (session.appliedRemoteOrderKeys.has(key)) {
            skippedKeys.push(key);
            continue;
        }
        if (session.isBakedIntoLoadedState(atTick)) {
            session.appliedRemoteOrderKeys.add(key);
            skippedKeys.push(key);
            continue;
        }
        // Non-host: never clamp a past-batch order onto the current tick (lobby 39E984).
        // Mark as applied for dedupe; BattleNet soft-align / recovery repairs the pause plane.
        if (!session.config.isHost && atTick < eng.gameTick) {
            session.appliedRemoteOrderKeys.add(key);
            skippedKeys.push(key);
            continue;
        }
        const order = rec.order;
        eng.state.orderMgr.queueOrder(atTick, order as unknown as BattleOrder);
        session.appliedRemoteOrderKeys.add(key);
        newlyAppliedKeys.push(key);
    }
    eng.tryResumeParallel();
    session.emit({
        type: 'pause_state',
        paused: !!eng.waitingForOrders,
        waitingForOrders: eng.waitingForOrders,
    });
    session.emit({ type: 'card_state', engine: eng });
    const wAfter = eng.waitingForOrders;
    const lobbyClient = session.config.api.getLobbyClient?.();
    if (orders.length > 0 && lobbyClient) {
        logToLobbyLogBattleSync({
            lobbyClient,
            lobbyId: session.config.api.getLobbyId(),
            playerId: session.config.playerId,
            tick: eng.gameTick,
            severity: 'info',
            gameId: session.config.api.getGameId(),
            message:
                'BattleSession.applyRemoteOrders: engine state after queueOrder (same effectiveTick+unitId replaces pending row)',
            context: {
                engineTickBeforeApply,
                engineTickAfter: eng.gameTick,
                incomingRows: summarizeRemoteWireRowsForLog(orders),
                newlyAppliedKeys,
                skippedKeys,
                pendingOrdersAfter: eng.pendingOrders.map((o) => ({
                    gameTick: o.gameTick,
                    unitId: o.order.unitId,
                    abilityId: o.order.abilityId,
                })),
                waitingForOrdersAfter:
                    wAfter == null
                        ? null
                        : {
                              atTick: wAfter.atTick,
                              waiterUnitIds: wAfter.waiters.map((x) => x.unitId),
                          },
            },
        });
    }
    return { newlyAppliedKeys, skippedKeys };
}

export async function submitPlayerOrderFor(
    session: BattleSession,
    order: BattleOrder, opts: { canSubmitOrders: boolean },
): Promise<void> {
    const engine = session.engine;
    if (!engine) return;

    let batch = engine.waitingForOrders;
    if (!batch || !opts.canSubmitOrders) return;
    if (!batch.waiters.some((w) => w.unitId === order.unitId)) return;

    const caster = engine.getUnit(order.unitId);
    const conditionalCancelFollowUp = isAtConditionalCancelDecision(engine, order.unitId, session.interactiveTargeting);

    // Defense in depth: deferred-first-select ITS leaves waitingForOrders set, so Wait/Space
    // could otherwise POST a wait for the open batch (lobby 10EA88). Commit uses
    // submitCommittedTargetingOrder / persistInPlaceCommittedTargetingOrder instead.
    if (session.interactiveTargeting.isActive) {
        if (!conditionalCancelFollowUp) {
            session.postBattleSyncLobbyLog('submitPlayerOrder blocked: ITS preview active', {
                abilityId: order.abilityId,
                unitId: order.unitId,
                endTurn: order.endTurn === true,
            });
            return;
        }
        // Assumed remote pass (or held remotes): the combo pause is not committable.
        // Confirm throw 1 only; do not POST the follow-up on this preview batch.
        if (session.interactiveTargeting.shouldForceItsCommitAtComboWindow()) {
            await session.interactiveTargeting.commit(session, 'combo_window_after_assumed_pass');
            return;
        }
        await session.interactiveTargeting.commit(session, 'conditional_cancel_follow_up');
        if (session.interactiveTargeting.isActive) return;
        // In-place commit leaves the follow-up on the preview's own pause plane (lobby E27AE2).
        batch = engine.waitingForOrders;
        if (!batch || !batch.waiters.some((w) => w.unitId === order.unitId)) return;
    }

    // Stale pause plane (lobby F6E500): do not start ITS or POST on a completed batch.
    const batchSubmittable = session.isOrderBatchTickSubmittable(batch.atTick);
    const expectedToAct = session.isLocalPlayerExpectedToAct();
    if (!batchSubmittable || !expectedToAct) {
        session.postBattleSyncLobbyLog('submitPlayerOrder rejected: stale pause plane', {
            abilityId: order.abilityId,
            unitId: order.unitId,
            batchAtTick: batch.atTick,
            engineTick: engine.gameTick,
            heartbeatOrderBatchAtTick: session.getHeartbeatOrderBatchAtTick(),
            batchSubmittable,
            expectedToAct,
            conditionalCancelFollowUp,
        });
        session.emitOrderSubmitFailed(order.unitId, order.abilityId);
        return;
    }

    // A new cast executeUnitAbility would refuse (no uses) must not start ITS or reach the
    // network: at a combo pause it would cancel the paused cast, then do nothing (lobby E27AE2).
    // Confirming / updating an already-pending order for the same ability spent its use already.
    const ability = order.abilityId !== 'wait' ? getAbility(order.abilityId) : undefined;
    const pendingForUnit = engine.state.orderMgr.getPendingOrderForUnit(order.unitId, batch.atTick);
    if (
        ability
        && caster
        && pendingForUnit?.abilityId !== order.abilityId
        && !canUseAbilityNow(caster, ability)
    ) {
        session.postBattleSyncLobbyLog('submitPlayerOrder rejected: ability not castable', {
            abilityId: order.abilityId,
            unitId: order.unitId,
            batchAtTick: batch.atTick,
            conditionalCancelFollowUp,
        });
        session.emitOrderSubmitFailed(order.unitId, order.abilityId);
        return;
    }

    // Combo / Entombed follow-ups enter ITS too; the preview order resolves the paused cast.
    if (USE_SEQUENTIAL_TARGETING) {
        if (ability && caster && getInteractiveTargetDefsFromTimings(ability, caster, engine).length > 0) {
            if (session.interactiveTargeting.begin(order, session)) {
                return;
            }
        }
    }

    await session.netAdapter?.submitOrder(order, batch.atTick);
}

export async function submitCommittedTargetingOrderFor(
    session: BattleSession,
    order: BattleOrder, atTick: number,
): Promise<boolean> {
    if (!session.netAdapter) {
        return false;
    }
    const unitId = order.unitId;
    const idHash = hashOrderId(session.config.playerId, atTick, order);
    await session.netAdapter.submitOrder(order, atTick);
    if (session.appliedRemoteOrderKeys.has(idHash)) {
        return true;
    }
    if (session.netAdapter.hasDeferredOrderFor?.(unitId, atTick)) {
        return true;
    }
    const engine = session.engine;
    if (engine?.state.orderMgr.hasPendingEndTurnOrderForUnit(unitId, atTick)) {
        return true;
    }
    return false;
}

export async function persistInPlaceCommittedTargetingOrderFor(
    session: BattleSession,
    order: BattleOrder, atTick: number, token?: CanonicalToken | null,
): Promise<boolean> {
    if (!session.netAdapter) return false;
    const pathAvailable = session.netAdapter.isOrderSubmitPathAvailable();
    if (!pathAvailable) return false;

    const idHash = hashOrderId(session.config.playerId, atTick, order);

    if (session.config.isHost) {
        const ok = await session.netAdapter.persistCommittedOrder(order, atTick, token);
        if (ok) {
            session.appliedRemoteOrderKeys.add(idHash);
        }
        return ok;
    }

    await session.netAdapter.submitOrder(order, atTick, { skipLocalApply: true, token });
    const deferred = session.netAdapter.hasDeferredOrderFor(order.unitId, atTick);
    if (deferred) {
        return false;
    }
    session.appliedRemoteOrderKeys.add(idHash);
    return true;
}

export function promotePreviewFor(
    session: BattleSession,
    runId: number,
): void {
    const timeline = session.timeline;
    if (timeline.kind !== 'preview' || timeline.runId !== runId) {
        session.postBattleSyncLobbyLog(`diag: promotePreview stale runId=${runId}, current timeline=${timeline.kind}`, {
            runId,
            currentTimeline: timeline.kind,
        });
        return;
    }

    const buffer = session.previewEmissionBuffer;
    session.timeline = toCanonical(timeline);
    session.previewEmissionBuffer = null;

    const engine = session.engine;
    if (engine) {
        engine.isSequentialTargetingPreview = false;
        engine.sequentialTargetingPreviewCast = null;
    }

    session.rebindEngineCallbacks();

    // Flush buffered emissions to the network. Best-effort: the timeline is already canonical,
    // so a network-layer failure must not abort the promotion half-way.
    if (buffer && session.config.isHost) {
        try {
            // Mint token for flushed emissions (timeline is now canonical)
            const token = session.mintCanonicalToken();
            // Flush fingerprints in tick order.
            for (const fp of buffer.fingerprints) {
                session.netAdapter?.queueFingerprint(fp.tick, fp.fp, fp.paused, fp.adminReason, token);
            }
            // Flush the latest checkpoint (if any).
            if (buffer.latestCheckpoint) {
                void session.netAdapter?.saveSnapshotOnPause(buffer.latestCheckpoint.tick, buffer.latestCheckpoint.state, token);
            }
            // Flush resolved batches.
            for (const batchAtTick of buffer.resolvedBatches) {
                void session.netAdapter?.mergeAppliedOrdersForBatch(batchAtTick);
            }
        } catch (err) {
            console.error('[BattleSession] promotePreview flush failed', err);
            session.postBattleSyncLobbyLog('diag: promotePreview flush failed', {
                runId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
}
