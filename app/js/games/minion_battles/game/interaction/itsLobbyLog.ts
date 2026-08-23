import type { BattleSession } from '../BattleSession';
import type { InteractiveTargetingSession } from './InteractiveTargetingSession';
import type { ResolvedTarget } from '../types';
import { STUCK_PAUSE_PLANE_DESYNC_MESSAGE } from '../battlenet/constants';

/** User-initiated ITS control (UI buttons or AUTO_END_TURN). */
export type ItsActionSource =
    | 'ui_reset'
    | 'ui_replay'
    | 'ui_done'
    | 'auto_end_turn'
    | 'terminal_outcome_auto_commit'
    | 'conditional_cancel_follow_up'
    | 'conditional_cancel_continue';

/** AUTO_END_TURN refused commit because not every SelectTargetDef label was collected. */
export const ITS_AUTO_COMMIT_BLOCK_TARGETS_INCOMPLETE = 'targets_incomplete';

/** Non-user ITS cancellation (resync, terminal teardown). */
export type ItsCancelReason =
    | 'user_reset'
    | 'resync_load_from_snapshot'
    | 'terminal_outcome_teardown';

export type ItsEndOutcome = 'submitted' | 'rejected' | 'cancelled';

export type ItsEndDetail =
    | 'rollback'
    | 'in_place'
    | 'stale_batch'
    | 'submit_failed'
    | 'persist_failed'
    | 'user_reset'
    | 'resync'
    | 'terminal_outcome';

export interface ItsLogSnapshot {
    abilityId: string | null;
    unitId: string | null;
    markTick: number | null;
    batchAtTick: number | null;
    selectLabels: readonly string[];
    collectedLabels: readonly string[];
}

/** Compact pending-order rows for lobby_log (keep payload small). */
export interface ItsPendingOrderLogRow {
    gameTick: number;
    unitId: string;
    abilityId: string;
    endTurn: boolean;
}

export interface ItsPausePlaneLog {
    waitingForOrdersAtTick: number | null;
    waiterUnitIds: string[];
    waitingForTargetInputLabel: string | null;
    isPaused: boolean;
    isSequentialTargetingPreview: boolean;
    previewOrderQueued: boolean;
    assumedRemoteWaitDuringPreview: boolean;
    pendingOrders: ItsPendingOrderLogRow[];
}

const ITS_BUTTON_CLICK_MESSAGES: Partial<Record<ItsActionSource, string>> = {
    ui_reset: 'ITS: Reset button clicked',
    ui_replay: 'ITS: Replay button clicked',
    ui_done: 'ITS: Done button clicked',
    auto_end_turn: 'ITS: auto end turn commit',
};

function summarizeTarget(target: ResolvedTarget): Record<string, unknown> {
    if (target.type === 'unit') {
        return { type: 'unit', unitId: target.unitId };
    }
    if (target.type === 'pixel') {
        return {
            type: 'pixel',
            x: target.position?.x ?? null,
            y: target.position?.y ?? null,
        };
    }
    return { type: target.type };
}

function itsContext(
    session: BattleSession,
    snapshot: ItsLogSnapshot,
    extra: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        engineTick: session.getEngineTick(),
        markTick: snapshot.markTick,
        batchAtTick: snapshot.batchAtTick,
        abilityId: snapshot.abilityId,
        unitId: snapshot.unitId,
        selectLabels: [...snapshot.selectLabels],
        collectedLabels: [...snapshot.collectedLabels],
        isHost: session.isHost(),
        ...extra,
    };
}

/** Pending orders + pause/select plane for diagnosing Space/wait-during-ITS and Undo races. */
export function captureItsPausePlaneLog(
    session: BattleSession,
    its?: InteractiveTargetingSession | null,
): ItsPausePlaneLog {
    const engine = session.getEngine();
    const waiting = engine?.waitingForOrders ?? null;
    const pendingOrders: ItsPendingOrderLogRow[] = (engine?.pendingOrders ?? []).map((row) => ({
        gameTick: row.gameTick,
        unitId: row.order.unitId,
        abilityId: row.order.abilityId,
        endTurn: row.order.endTurn === true,
    }));
    return {
        waitingForOrdersAtTick: waiting?.atTick ?? null,
        waiterUnitIds: waiting?.waiters.map((w) => w.unitId) ?? [],
        waitingForTargetInputLabel: engine?.waitingForTargetInput?.label ?? null,
        isPaused: engine?.isPaused === true,
        isSequentialTargetingPreview: engine?.isSequentialTargetingPreview === true,
        previewOrderQueued: its?.previewOrderQueued === true,
        assumedRemoteWaitDuringPreview: its?.hasAssumedRemoteWaitDuringPreview === true,
        pendingOrders,
    };
}

export function captureItsLogSnapshot(
    its: InteractiveTargetingSession,
    session: BattleSession,
    markBatchAtTick?: number | null,
): ItsLogSnapshot {
    const engine = session.getEngine();
    return {
        abilityId: its.abilityId,
        unitId: its.unitId,
        markTick: its.savedLocalTick,
        batchAtTick: engine?.waitingForOrders?.atTick ?? markBatchAtTick ?? null,
        selectLabels: its.selectLabels,
        collectedLabels: Object.keys(its.collectedTargets),
    };
}

export function logItsButtonClick(
    session: BattleSession,
    its: InteractiveTargetingSession,
    source: ItsActionSource,
): void {
    const message = ITS_BUTTON_CLICK_MESSAGES[source];
    if (!message) return;
    session.postBattleSyncLobbyLog(
        message,
        itsContext(session, captureItsLogSnapshot(its, session), {
            source,
            allTargetsCollected: its.allTargetsCollected(),
            pausePlane: captureItsPausePlaneLog(session, its),
        }),
    );
}

export function logItsPreviewStarted(
    session: BattleSession,
    its: InteractiveTargetingSession,
    extra: { batchAtTick: number; deferredFirstLabel: string | null },
): void {
    session.postBattleSyncLobbyLog(
        'ITS: preview started',
        itsContext(session, captureItsLogSnapshot(its, session), {
            batchAtTick: extra.batchAtTick,
            deferredFirstLabel: extra.deferredFirstLabel,
            pausePlane: captureItsPausePlaneLog(session, its),
        }),
    );
}

export function logItsTargetAdded(
    session: BattleSession,
    its: InteractiveTargetingSession,
    label: string,
    target: ResolvedTarget,
    allTargetsCollected: boolean,
): void {
    session.postBattleSyncLobbyLog(
        'ITS: target added',
        itsContext(session, captureItsLogSnapshot(its, session), {
            label,
            target: summarizeTarget(target),
            allTargetsCollected,
        }),
    );
}

export function logItsMovementReinput(
    session: BattleSession,
    its: InteractiveTargetingSession,
    label: string,
    movePathLen: number,
    hasMoveTargetPixel: boolean,
): void {
    session.postBattleSyncLobbyLog(
        'ITS: movement reinput',
        itsContext(session, captureItsLogSnapshot(its, session), {
            label,
            movePathLen,
            hasMoveTargetPixel,
            pausePlane: captureItsPausePlaneLog(session, its),
        }),
    );
}

export function logItsSelectPauseEntered(
    session: BattleSession,
    its: InteractiveTargetingSession,
    label: string,
): void {
    session.postBattleSyncLobbyLog(
        'ITS: select pause entered',
        itsContext(session, captureItsLogSnapshot(its, session), {
            label,
            pausePlane: captureItsPausePlaneLog(session, its),
        }),
    );
}

/**
 * Logged whenever AUTO_END_TURN considers committing — whether or not it proceeds.
 * Distinguishes preview-complete vs all-targets-collected (lobby 12D040 / 10EA88).
 */
export function logItsAutoCommitEval(
    session: BattleSession,
    its: InteractiveTargetingSession,
    extra: {
        previewComplete: boolean;
        allTargetsCollected: boolean;
        willCommit: boolean;
        blockReason: string | null;
    },
): void {
    session.postBattleSyncLobbyLog(
        'ITS: auto end turn eval',
        itsContext(session, captureItsLogSnapshot(its, session), {
            source: 'auto_end_turn',
            ...extra,
            pausePlane: captureItsPausePlaneLog(session, its),
        }),
    );
}

/** Undo/Reset: capture pause-plane before restore so wait-in-cache races show up. */
export function logItsResetPausePlane(
    session: BattleSession,
    its: InteractiveTargetingSession,
    phase: 'before_restore' | 'after_restore',
): void {
    const pausePlane = captureItsPausePlaneLog(session, its);
    session.postBattleSyncLobbyLog(
        phase === 'before_restore' ? 'ITS: reset pause plane before restore' : 'ITS: reset pause plane after restore',
        itsContext(session, captureItsLogSnapshot(its, session), {
            source: 'ui_reset',
            phase,
            pausePlane,
        }),
    );
    if (
        phase === 'after_restore' &&
        pausePlane.isPaused &&
        pausePlane.waitingForOrdersAtTick == null &&
        pausePlane.waitingForTargetInputLabel == null
    ) {
        session.postDesyncLobbyLogForced?.(STUCK_PAUSE_PLANE_DESYNC_MESSAGE, itsContext(session, captureItsLogSnapshot(its, session), {
            source: 'its_reset_after_restore',
            pausePlane,
        }));
    }
}

export function logItsPreviewEnded(
    session: BattleSession,
    snapshot: ItsLogSnapshot,
    outcome: ItsEndOutcome,
    detail: ItsEndDetail,
    extra: Record<string, unknown> = {},
): void {
    session.postBattleSyncLobbyLog(
        'ITS: preview ended',
        itsContext(session, snapshot, { outcome, detail, ...extra }),
    );
}

export function logItsPreviewCancelled(
    session: BattleSession,
    snapshot: ItsLogSnapshot,
    reason: ItsCancelReason,
): void {
    const detail: ItsEndDetail =
        reason === 'user_reset'
            ? 'user_reset'
            : reason === 'resync_load_from_snapshot'
                ? 'resync'
                : 'terminal_outcome';
    logItsPreviewEnded(session, snapshot, 'cancelled', detail, { cancelReason: reason });
}

/**
 * Space / Wait / End-turn from the order UI — especially while ITS is active
 * (lobby 12D040: wait POSTed during Swing Sword preview, then Undo auto-played).
 */
export function logOrderUiKeyAction(
    session: BattleSession,
    extra: {
        action: 'space' | 'wait' | 'end_turn';
        itsActive: boolean;
        canUseOrderUi: boolean;
        hasActiveLocalWaiter: boolean;
        hasNonconfirmedOrder: boolean;
        autoEndTurn: boolean;
        blocked: boolean;
        blockReason: string | null;
    },
): void {
    const its = session.interactiveTargeting;
    const snapshot = its.isActive
        ? captureItsLogSnapshot(its, session)
        : {
              abilityId: null,
              unitId: null,
              markTick: null,
              batchAtTick: session.getEngine()?.waitingForOrders?.atTick ?? null,
              selectLabels: [] as string[],
              collectedLabels: [] as string[],
          };
    session.postBattleSyncLobbyLog(
        'order UI: Space/Wait/EndTurn',
        itsContext(session, snapshot, {
            ...extra,
            pausePlane: captureItsPausePlaneLog(session, its.isActive ? its : null),
        }),
    );
}
