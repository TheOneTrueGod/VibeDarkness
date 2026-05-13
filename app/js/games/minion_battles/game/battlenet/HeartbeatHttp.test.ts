import { describe, it, expect, vi } from 'vitest';
import { HeartbeatHttp } from './HeartbeatHttp';
import type { BattleApi } from './types';

function makeStubApi(getBattleHeartbeat: BattleApi['getBattleHeartbeat']): BattleApi {
    return {
        appendBattleOrder: vi.fn() as unknown as BattleApi['appendBattleOrder'],
        getBattleOrdersRange: vi.fn() as unknown as BattleApi['getBattleOrdersRange'],
        getBattleSnapshot: vi.fn() as unknown as BattleApi['getBattleSnapshot'],
        getBattleHeartbeat,
        mergeBattleAppliedOrders: vi.fn() as unknown as BattleApi['mergeBattleAppliedOrders'],
        saveBattleInitialState: vi.fn() as unknown as BattleApi['saveBattleInitialState'],
        getBattleInitialState: vi.fn() as unknown as BattleApi['getBattleInitialState'],
        saveBattleSnapshot: vi.fn() as unknown as BattleApi['saveBattleSnapshot'],
        appendBattleFingerprints: vi.fn() as unknown as BattleApi['appendBattleFingerprints'],
        getBattleFingerprintsRange: vi.fn() as unknown as BattleApi['getBattleFingerprintsRange'],
    };
}

function makeHttp(api: BattleApi): HeartbeatHttp {
    return new HeartbeatHttp({
        api,
        lobbyId: 'l1',
        gameId: 'g1',
        playerId: 'p1',
        heartbeatTraceInstanceId: 1,
    });
}

const HB_OK = {
    hostTick: 0,
    hostFingerprint: null,
    hostPaused: false,
    ordersTipTick: 0,
    pausedAtTick: null,
    expectingFromPlayerIds: null,
    initialFingerprint: null,
};

describe('HeartbeatHttp', () => {
    it('serializes overlapping calls so a second call does not start until the first resolves', async () => {
        let inflight = 0;
        let maxInflight = 0;
        const getBattleHeartbeat = vi.fn(async () => {
            inflight++;
            maxInflight = Math.max(maxInflight, inflight);
            await new Promise((r) => setTimeout(r, 10));
            inflight--;
            return HB_OK as unknown as Awaited<ReturnType<BattleApi['getBattleHeartbeat']>>;
        });
        const http = makeHttp(makeStubApi(getBattleHeartbeat as unknown as BattleApi['getBattleHeartbeat']));
        await Promise.all([
            http.getBattleHeartbeatThrottled({ tracePhase: 'first' }),
            http.getBattleHeartbeatThrottled({ tracePhase: 'second' }),
            http.getBattleHeartbeatThrottled({ tracePhase: 'third' }),
        ]);
        expect(getBattleHeartbeat).toHaveBeenCalledTimes(3);
        expect(maxInflight).toBe(1);
    });

    it('forwards gameTick to the underlying API call', async () => {
        const getBattleHeartbeat = vi.fn(
            async () => HB_OK as unknown as Awaited<ReturnType<BattleApi['getBattleHeartbeat']>>,
        );
        const http = makeHttp(makeStubApi(getBattleHeartbeat as unknown as BattleApi['getBattleHeartbeat']));
        await http.getBattleHeartbeatThrottled({ gameTick: 17 });
        expect(getBattleHeartbeat).toHaveBeenCalledWith('l1', 'g1', 'p1', { gameTick: 17 });
    });

    it('continues the chain after a rejected call (next caller still runs)', async () => {
        let calls = 0;
        const getBattleHeartbeat = vi.fn(async () => {
            calls++;
            if (calls === 1) {
                throw new Error('boom');
            }
            return HB_OK as unknown as Awaited<ReturnType<BattleApi['getBattleHeartbeat']>>;
        });
        const http = makeHttp(makeStubApi(getBattleHeartbeat as unknown as BattleApi['getBattleHeartbeat']));
        await expect(http.getBattleHeartbeatThrottled()).rejects.toThrow('boom');
        await expect(http.getBattleHeartbeatThrottled()).resolves.toBeDefined();
        expect(getBattleHeartbeat).toHaveBeenCalledTimes(2);
    });
});
