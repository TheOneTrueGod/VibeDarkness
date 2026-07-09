import { describe, it, expect, vi } from 'vitest';
import type { BattleSession } from '../BattleSession';
import type { InteractiveTargetingSession } from './InteractiveTargetingSession';
import {
    captureItsLogSnapshot,
    logItsPreviewCancelled,
    logItsPreviewEnded,
    logItsPreviewStarted,
    logItsTargetAdded,
    logItsButtonClick,
} from './itsLobbyLog';

function makeSessionMock(): BattleSession & { postBattleSyncLobbyLog: ReturnType<typeof vi.fn> } {
    return {
        getEngineTick: () => 42,
        getEngine: () => null,
        isHost: () => false,
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
            expect.objectContaining({ source: 'ui_done' }),
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
