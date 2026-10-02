import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FingerprintBatcher } from './FingerprintBatcher';
import type { BattleApi } from './types';

const { logToLobbyLog } = vi.hoisted(() => ({
    logToLobbyLog: vi.fn(),
}));

vi.mock('../../../../lobbyLog', () => ({
    logToLobbyLog,
}));

function makeApi(
    appendBattleFingerprints: BattleApi['appendBattleFingerprints'] = vi.fn(async () => ({ appended: 0 })),
): BattleApi {
    return {
        appendBattleOrder: vi.fn() as unknown as BattleApi['appendBattleOrder'],
        getBattleOrdersRange: vi.fn() as unknown as BattleApi['getBattleOrdersRange'],
        getBattleSnapshot: vi.fn() as unknown as BattleApi['getBattleSnapshot'],
        getBattleHeartbeat: vi.fn() as unknown as BattleApi['getBattleHeartbeat'],
        mergeBattleAppliedOrders: vi.fn() as unknown as BattleApi['mergeBattleAppliedOrders'],
        persistHostCycles: vi.fn() as unknown as BattleApi['persistHostCycles'],
        saveBattleInitialState: vi.fn() as unknown as BattleApi['saveBattleInitialState'],
        getBattleInitialState: vi.fn() as unknown as BattleApi['getBattleInitialState'],
        saveBattleSnapshot: vi.fn() as unknown as BattleApi['saveBattleSnapshot'],
        appendBattleFingerprints,
        getBattleFingerprintsRange: vi.fn() as unknown as BattleApi['getBattleFingerprintsRange'],
    };
}

function make(isHost = true): { batcher: FingerprintBatcher; api: BattleApi } {
    const api = makeApi();
    const batcher = new FingerprintBatcher({
        api,
        isHost,
        lobbyId: 'l1',
        gameId: 'g1',
        playerId: 'p1',
        // Default: current epoch is 0, so pass token with epoch 0 to pass validation
        getCurrentEngineEpoch: () => 0,
    });
    return { batcher, api };
}

describe('FingerprintBatcher', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('queueFingerprint is a no-op for non-host clients', async () => {
        const { batcher, api } = make(false);
        const token = { engineEpoch: 0, __brand: 'CanonicalToken' as const };
        batcher.queueFingerprint(1, 'fp1', false, undefined, token);
        await batcher.flush();
        expect(api.appendBattleFingerprints).not.toHaveBeenCalled();
        expect(batcher.getPendingCount()).toBe(0);
    });

    it('flush is a no-op when batch is empty', async () => {
        const { batcher, api } = make(true);
        await batcher.flush();
        expect(api.appendBattleFingerprints).not.toHaveBeenCalled();
    });

    it('flush sends all queued records as one append batch', async () => {
        const { batcher, api } = make(true);
        const token = { engineEpoch: 0, __brand: 'CanonicalToken' as const };
        batcher.queueFingerprint(1, 'a', false, undefined, token);
        batcher.queueFingerprint(2, 'b', true, undefined, token);
        await batcher.flush();
        expect(api.appendBattleFingerprints).toHaveBeenCalledTimes(1);
        expect(api.appendBattleFingerprints).toHaveBeenCalledWith('l1', 'g1', {
            playerId: 'p1',
            records: [
                { tick: 1, fp: 'a', paused: false },
                { tick: 2, fp: 'b', paused: true },
            ],
        });
        expect(batcher.getPendingCount()).toBe(0);
    });

    it('flush re-queues records when the append POST throws', async () => {
        const append = vi.fn(async () => {
            throw new Error('network');
        });
        const api = makeApi(append as unknown as BattleApi['appendBattleFingerprints']);
        const batcher = new FingerprintBatcher({
            api,
            isHost: true,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
            getCurrentEngineEpoch: () => 0,
        });
        const token = { engineEpoch: 0, __brand: 'CanonicalToken' as const };
        batcher.queueFingerprint(5, 'fp', false, undefined, token);
        await batcher.flush();
        expect(batcher.getPendingCount()).toBe(1);
    });

    it('startPeriodicFlush triggers flush() on interval and stopPeriodicFlush halts further calls', async () => {
        vi.useFakeTimers();
        try {
            const { batcher, api } = make(true);
            const token = { engineEpoch: 0, __brand: 'CanonicalToken' as const };
            batcher.queueFingerprint(1, 'fp', false, undefined, token);
            batcher.startPeriodicFlush(100);
            await vi.advanceTimersByTimeAsync(150);
            expect(api.appendBattleFingerprints).toHaveBeenCalledTimes(1);
            batcher.stopPeriodicFlush();
            batcher.queueFingerprint(2, 'fp2', false, undefined, token);
            await vi.advanceTimersByTimeAsync(200);
            expect(api.appendBattleFingerprints).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('startPeriodicFlush does nothing for non-host clients', () => {
        vi.useFakeTimers();
        try {
            const { batcher } = make(false);
            batcher.startPeriodicFlush(100);
            expect(vi.getTimerCount()).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it('queueFingerprint requires valid canonical token; missing/stale token → not queued + diag log', async () => {
        const api = makeApi();
        const batcher = new FingerprintBatcher({
            api,
            isHost: true,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
            getCurrentEngineEpoch: () => 5,
        });

        // No token → not queued, diag logged
        batcher.queueFingerprint(10, 'fp1', false, undefined, null);
        expect(batcher.getPendingCount()).toBe(0);
        expect(logToLobbyLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'diag: queueFingerprint skipped (stale or missing token)',
            }),
        );
        logToLobbyLog.mockClear();

        // Stale token (epoch 3 vs current 5) → not queued, one diag line per episode (not per tick)
        const staleToken = { engineEpoch: 3, __brand: 'CanonicalToken' as const };
        batcher.queueFingerprint(11, 'fp2', false, undefined, staleToken);
        expect(logToLobbyLog).toHaveBeenCalledTimes(1);
        batcher.queueFingerprint(12, 'fp3', false, undefined, staleToken); // Same episode, later tick: no new log
        expect(logToLobbyLog).toHaveBeenCalledTimes(1);
        expect(batcher.getPendingCount()).toBe(0);
        logToLobbyLog.mockClear();

        // Current token (epoch 5) → queued
        const currentToken = { engineEpoch: 5, __brand: 'CanonicalToken' as const };
        batcher.queueFingerprint(13, 'fp4', false, undefined, currentToken);
        expect(batcher.getPendingCount()).toBe(1);
        expect(logToLobbyLog).not.toHaveBeenCalled();

        await batcher.flush();
        expect(api.appendBattleFingerprints).toHaveBeenCalledWith(
            'l1',
            'g1',
            expect.objectContaining({
                records: [{ tick: 13, fp: 'fp4', paused: false }],
            }),
        );
    });
});
