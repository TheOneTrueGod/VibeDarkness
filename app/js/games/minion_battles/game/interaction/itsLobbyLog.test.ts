import { describe, it, expect, vi } from 'vitest';
import type { BattleSession } from '../BattleSession';
import type { InteractiveTargetingSession } from './InteractiveTargetingSession';
import {
    ITS_AUTO_COMMIT_BLOCK_TARGETS_INCOMPLETE,
    captureItsLogSnapshot,
    captureItsPausePlaneLog,
    logItsPreviewCancelled,
    logItsPreviewEnded,
    logItsPreviewStarted,
    logItsTargetAdded,
    logItsButtonClick,
    logItsMovementReinput,
    logItsSelectPauseEntered,
    logItsAutoCommitEval,
    logItsResetPausePlane,
    logOrderUiKeyAction,
} from './itsLobbyLog';

function makeSessionMock(): BattleSession & { postBattleSyncLobbyLog: ReturnType<typeof vi.fn> } {
    return {
        getEngineTick: () => 42,
        getEngine: () => null,
        isHost: () => false,
        interactiveTargeting: { isActive: false },
        postBattleSyncLobbyLog: vi.fn(),
    } as unknown as BattleSession & { postBattleSyncLobbyLog: ReturnType<typeof vi.fn> };
}

function makeItsMock(): InteractiveTargetingSession {
    return {
        abilityId: '0116',
        unitId: 'unit_1',
        savedLocalTick: 40,
        selectLabels: ['Target 1', 'Target 2'],
        collectedTargets: { 'Target 1': { type: 'unit', unitId: 'enemy_1' } },
        isActive: true,
        previewOrderQueued: true,
        hasAssumedRemoteWaitDuringPreview: false,
        allTargetsCollected: () => false,
    } as unknown as InteractiveTargetingSession;
}

describe('itsLobbyLog', () => {
    it('captureItsLogSnapshot reads public ITS state', () => {
        const session = makeSessionMock();
        const its = makeItsMock();
        expect(captureItsLogSnapshot(its, session, 41)).toMatchObject({
            abilityId: '0116',
            unitId: 'unit_1',
            markTick: 40,
            batchAtTick: 41,
            selectLabels: ['Target 1', 'Target 2'],
            collectedLabels: ['Target 1'],
        });
    });

    it('captureItsPausePlaneLog handles missing engine', () => {
        const session = makeSessionMock();
        expect(captureItsPausePlaneLog(session, makeItsMock())).toMatchObject({
            waitingForOrdersAtTick: null,
            waiterUnitIds: [],
            waitingForTargetInputLabel: null,
            previewOrderQueued: true,
            assumedRemoteWaitDuringPreview: false,
            pendingOrders: [],
        });
    });

    it('logItsPreviewStarted posts battle-sync info', () => {
        const session = makeSessionMock();
        const its = makeItsMock();
        logItsPreviewStarted(session, its, { batchAtTick: 41, deferredFirstLabel: null });
        expect(session.postBattleSyncLobbyLog).toHaveBeenCalledWith(
            'ITS: preview started',
            expect.objectContaining({
                engineTick: 42,
                batchAtTick: 41,
                deferredFirstLabel: null,
                abilityId: '0116',
                pausePlane: expect.objectContaining({ previewOrderQueued: true }),
            }),
        );
    });

    it('logItsTargetAdded includes label and collection state', () => {
        const session = makeSessionMock();
        const its = makeItsMock();
        const target = { type: 'unit' as const, unitId: 'enemy_2' };
        logItsTargetAdded(session, its, 'Target 2', target, true);
        expect(session.postBattleSyncLobbyLog).toHaveBeenCalledWith(
            'ITS: target added',
            expect.objectContaining({
                label: 'Target 2',
                target: { type: 'unit', unitId: 'enemy_2' },
                allTargetsCollected: true,
            }),
        );
    });

    it('logItsButtonClick maps ui_done to Done button message', () => {
        const session = makeSessionMock();
        const its = makeItsMock();
        logItsButtonClick(session, its, 'ui_done');
        expect(session.postBattleSyncLobbyLog).toHaveBeenCalledWith(
            'ITS: Done button clicked',
            expect.objectContaining({
                source: 'ui_done',
                allTargetsCollected: false,
                pausePlane: expect.any(Object),
            }),
        );
    });

    it('logItsMovementReinput records path length and label', () => {
        const session = makeSessionMock();
        logItsMovementReinput(session, makeItsMock(), 'Target 1', 3, true);
        expect(session.postBattleSyncLobbyLog).toHaveBeenCalledWith(
            'ITS: movement reinput',
            expect.objectContaining({
                label: 'Target 1',
                movePathLen: 3,
                hasMoveTargetPixel: true,
            }),
        );
    });

    it('logItsSelectPauseEntered records label', () => {
        const session = makeSessionMock();
        logItsSelectPauseEntered(session, makeItsMock(), 'Target 2');
        expect(session.postBattleSyncLobbyLog).toHaveBeenCalledWith(
            'ITS: select pause entered',
            expect.objectContaining({ label: 'Target 2' }),
        );
    });

    it('logItsAutoCommitEval records blocked incomplete-target auto-commits', () => {
        const session = makeSessionMock();
        logItsAutoCommitEval(session, makeItsMock(), {
            previewComplete: true,
            allTargetsCollected: false,
            willCommit: false,
            blockReason: ITS_AUTO_COMMIT_BLOCK_TARGETS_INCOMPLETE,
        });
        expect(session.postBattleSyncLobbyLog).toHaveBeenCalledWith(
            'ITS: auto end turn eval',
            expect.objectContaining({
                allTargetsCollected: false,
                willCommit: false,
                blockReason: ITS_AUTO_COMMIT_BLOCK_TARGETS_INCOMPLETE,
            }),
        );
    });

    it('logItsResetPausePlane tags before/after restore', () => {
        const session = makeSessionMock();
        logItsResetPausePlane(session, makeItsMock(), 'before_restore');
        expect(session.postBattleSyncLobbyLog).toHaveBeenCalledWith(
            'ITS: reset pause plane before restore',
            expect.objectContaining({ phase: 'before_restore', source: 'ui_reset' }),
        );
    });

    it('logOrderUiKeyAction records wait during ITS', () => {
        const session = makeSessionMock();
        logOrderUiKeyAction(session, {
            action: 'wait',
            itsActive: true,
            canUseOrderUi: true,
            hasActiveLocalWaiter: true,
            hasNonconfirmedOrder: false,
            autoEndTurn: true,
            blocked: false,
            blockReason: null,
        });
        expect(session.postBattleSyncLobbyLog).toHaveBeenCalledWith(
            'order UI: Space/Wait/EndTurn',
            expect.objectContaining({ action: 'wait', itsActive: true, blocked: false }),
        );
    });

    it('logItsPreviewEnded records submit vs reject outcome', () => {
        const session = makeSessionMock();
        const snapshot = captureItsLogSnapshot(makeItsMock(), session, 41);
        logItsPreviewEnded(session, snapshot, 'submitted', 'rollback', { atTick: 41 });
        expect(session.postBattleSyncLobbyLog).toHaveBeenCalledWith(
            'ITS: preview ended',
            expect.objectContaining({ outcome: 'submitted', detail: 'rollback', atTick: 41 }),
        );
    });

    it('logItsPreviewCancelled maps resync to cancelled outcome', () => {
        const session = makeSessionMock();
        const snapshot = captureItsLogSnapshot(makeItsMock(), session, 41);
        logItsPreviewCancelled(session, snapshot, 'resync_load_from_snapshot');
        expect(session.postBattleSyncLobbyLog).toHaveBeenCalledWith(
            'ITS: preview ended',
            expect.objectContaining({
                outcome: 'cancelled',
                detail: 'resync',
                cancelReason: 'resync_load_from_snapshot',
            }),
        );
    });
});
