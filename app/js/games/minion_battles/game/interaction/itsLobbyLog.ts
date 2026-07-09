import type { BattleSession } from '../BattleSession';
import type { InteractiveTargetingSession } from './InteractiveTargetingSession';
import type { ResolvedTarget } from '../types';

/** User-initiated ITS control (UI buttons or AUTO_END_TURN). */
export type ItsActionSource =
    | 'ui_reset'
    | 'ui_replay'
    | 'ui_done'
    | 'auto_end_turn'
    | 'terminal_outcome_auto_commit';

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
    if (target.type === 'position') {
        return {
            type: 'position',
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
    session.postBattleSyncLobbyLog(message, itsContext(session, captureItsLogSnapshot(its, session), { source }));
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
