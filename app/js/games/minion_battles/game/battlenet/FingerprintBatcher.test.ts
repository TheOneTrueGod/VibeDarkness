import { describe, it, expect, vi } from 'vitest';
import { FingerprintBatcher } from './FingerprintBatcher';
import type { BattleApi } from './types';

function makeApi(
    appendBattleFingerprints: BattleApi['appendBattleFingerprints'] = vi.fn(async () => ({ appended: 0 })),
): BattleApi {
    return {
        appendBattleOrder: vi.fn() as unknown as BattleApi['appendBattleOrder'],
        getBattleOrdersRange: vi.fn() as unknown as BattleApi['getBattleOrdersRange'],
        getBattleSnapshot: vi.fn() as unknown as BattleApi['getBattleSnapshot'],
        getBattleHeartbeat: vi.fn() as unknown as BattleApi['getBattleHeartbeat'],
        mergeBattleAppliedOrders: vi.fn() as unknown as BattleApi['mergeBattleAppliedOrders'],
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
    });
    return { batcher, api };
}

describe('FingerprintBatcher', () => {
    it('queueFingerprint is a no-op for non-host clients', async () => {
        const { batcher, api } = make(false);
        batcher.queueFingerprint(1, 'fp1', false);
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
        batcher.queueFingerprint(1, 'a', false);
        batcher.queueFingerprint(2, 'b', true);
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
        });
        batcher.queueFingerprint(5, 'fp', false);
        await batcher.flush();
        expect(batcher.getPendingCount()).toBe(1);
    });

    it('startPeriodicFlush triggers flush() on interval and stopPeriodicFlush halts further calls', async () => {
        vi.useFakeTimers();
        try {
            const { batcher, api } = make(true);
            batcher.queueFingerprint(1, 'fp', false);
            batcher.startPeriodicFlush(100);
            await vi.advanceTimersByTimeAsync(150);
            expect(api.appendBattleFingerprints).toHaveBeenCalledTimes(1);
            batcher.stopPeriodicFlush();
            batcher.queueFingerprint(2, 'fp2', false);
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
});
