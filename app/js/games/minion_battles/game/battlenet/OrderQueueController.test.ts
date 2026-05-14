import { describe, it, expect, vi } from 'vitest';
import type { BattleOrder } from '../types';
import { BattleEventBus } from './BattleEventBus';
import { FingerprintBatcher } from './FingerprintBatcher';
import { HeartbeatHttp } from './HeartbeatHttp';
import { HeartbeatState } from './HeartbeatState';
import { OrderQueueController } from './OrderQueueController';
import { SnapshotPersistence } from './SnapshotPersistence';
import { SyncReconciler } from './SyncReconciler';
import { SyncStatusController } from './SyncStatusController';
import type { BattleNetContext } from './BattleNetContext';
import type { BattleApi, BattleSessionHandle } from './types';
import type { SerializedGameState } from '../types';
import { BATTLE_NET_MAX_DEFERRED_ORDERS } from './constants';

function makeOrder(unitId: string): BattleOrder {
    return { unitId, abilityId: 'fireball', targets: [] };
}

function makeSession(): BattleSessionHandle {
    return {
        getEngineTick: () => 0,
        getRuntimeFingerprintHex: () => 'aaaaaaaa',
        getFingerprintTailPaused: () => false,
        getLatestFingerprint: () => null,
        getFingerprintRange: () => [],
        getInitialFingerprint: () => '00112233',
        getSerializedSnapshot: () => ({ gameTick: 0 } as SerializedGameState),
        getSerializedInitialState: () => ({ gameTick: 0 } as SerializedGameState),
        getPayloadForPersistedInitialStateOrNull: () => null,
        startEngine: () => {},
        loadFromSnapshot: () => {},
        applyRemoteOrders: vi.fn(),
        isPausedForOrderSync: () => false,
        getWaitingForOrdersBatch: () => null,
        isDebugSimulationFrozen: () => false,
        isEngineSimulationRunning: () => false,
        setMultiplayerAwaitHostCatchup: () => {},
    };
}

function makeApi(): BattleApi {
    return {
        appendBattleOrder: vi.fn(async () => ({ accepted: true, idHash: 'x' })) as unknown as BattleApi['appendBattleOrder'],
        getBattleOrdersRange: vi.fn(async () => ({ orders: [] })) as unknown as BattleApi['getBattleOrdersRange'],
        getBattleSnapshot: vi.fn(async () => null) as unknown as BattleApi['getBattleSnapshot'],
        getBattleHeartbeat: vi.fn() as unknown as BattleApi['getBattleHeartbeat'],
        mergeBattleAppliedOrders: vi.fn() as unknown as BattleApi['mergeBattleAppliedOrders'],
        saveBattleInitialState: vi.fn() as unknown as BattleApi['saveBattleInitialState'],
        getBattleInitialState: vi.fn() as unknown as BattleApi['getBattleInitialState'],
        saveBattleSnapshot: vi.fn() as unknown as BattleApi['saveBattleSnapshot'],
        appendBattleFingerprints: vi.fn() as unknown as BattleApi['appendBattleFingerprints'],
        getBattleFingerprintsRange: vi.fn() as unknown as BattleApi['getBattleFingerprintsRange'],
    };
}

function makeCtx(): BattleNetContext & { requestResync: ReturnType<typeof vi.fn> } {
    const events = new BattleEventBus();
    const api = makeApi();
    const session = makeSession();
    const heartbeatState = new HeartbeatState();
    const heartbeatHttp = new HeartbeatHttp({
        api,
        lobbyId: 'l1',
        gameId: 'g1',
        playerId: 'p1',
        heartbeatTraceInstanceId: 1,
    });
    const syncStatus = new SyncStatusController(events);
    const fingerprintBatcher = new FingerprintBatcher({
        api,
        isHost: false,
        lobbyId: 'l1',
        gameId: 'g1',
        playerId: 'p1',
    });
    const snapshotPersistence = new SnapshotPersistence({
        api,
        session,
        isHost: false,
        lobbyId: 'l1',
        gameId: 'g1',
        playerId: 'p1',
        requestResync: () => {},
    });
    const requestResync = vi.fn();
    const syncReconcilerRef: { current?: SyncReconciler } = {};
    const ctx: BattleNetContext & { requestResync: ReturnType<typeof vi.fn> } = {
        api,
        session,
        isHost: false,
        lobbyId: 'l1',
        gameId: 'g1',
        playerId: 'p1',
        heartbeatTraceInstanceId: 1,
        events,
        syncStatus,
        get syncReconciler() {
            return syncReconciler;
        },
        heartbeatHttp,
        heartbeatState,
        fingerprintBatcher,
        snapshotPersistence,
        isRecovering: false,
        requestResync,
        notePreviouslySyncedAnchorTick: vi.fn(),
        resetForDesyncRecoveryEntry: vi.fn(),
    };
    syncReconcilerRef.current = new SyncReconciler(ctx);
    return ctx;
}

describe('OrderQueueController.getOrderSyncSummary', () => {
    it('returns zero when nothing is queued or in flight', () => {
        const q = new OrderQueueController(makeCtx());
        expect(q.getOrderSyncSummary()).toEqual({ queued: 0, sending: 0 });
    });

    it('counts deferred entries as queued', () => {
        const q = new OrderQueueController(makeCtx());
        q.deferLocalOrder('h1', 5, makeOrder('u1'), false);
        q.deferLocalOrder('h2', 6, makeOrder('u2'), false);
        expect(q.getOrderSyncSummary()).toEqual({ queued: 2, sending: 0 });
    });

    it('counts in-flight server-range awaiters as sending (deferred orders excluded)', () => {
        const q = new OrderQueueController(makeCtx());
        q.getOurOrdersAwaitingServerRange().add('h1');
        q.getOurOrdersAwaitingServerRange().add('h2');
        q.deferLocalOrder('h2', 5, makeOrder('u'), false);
        expect(q.getOrderSyncSummary()).toEqual({ queued: 1, sending: 1 });
    });

    it('does not count an order already confirmed in a server range fetch as sending', () => {
        const q = new OrderQueueController(makeCtx());
        q.getOurOrdersAwaitingServerRange().add('h1');
        q.getServerRangeConfirmedOurOrderHashes().add('h1');
        expect(q.getOrderSyncSummary()).toEqual({ queued: 0, sending: 0 });
    });
});

describe('OrderQueueController.deferLocalOrder', () => {
    it('does nothing when the same idHash is already queued', () => {
        const q = new OrderQueueController(makeCtx());
        q.deferLocalOrder('h1', 5, makeOrder('u'), false);
        q.deferLocalOrder('h1', 5, makeOrder('u'), false);
        expect(q.getDeferredLocalOrders()).toHaveLength(1);
    });

    it('requests resync when the queue exceeds the cap', () => {
        const ctx = makeCtx();
        const q = new OrderQueueController(ctx);
        for (let i = 0; i < BATTLE_NET_MAX_DEFERRED_ORDERS; i++) {
            q.deferLocalOrder(`h${i}`, 5, makeOrder('u'), false);
        }
        q.deferLocalOrder('overflow', 5, makeOrder('u'), false);
        expect(ctx.requestResync).toHaveBeenCalledWith('deferred-queue-overflow');
        expect(q.getDeferredLocalOrders().length).toBe(BATTLE_NET_MAX_DEFERRED_ORDERS);
    });
});

describe('OrderQueueController.applyDeferredRowLocallyIfNeeded', () => {
    it('applies the order via session and emits orders-applied once', () => {
        const ctx = makeCtx();
        const emitSpy = vi.fn();
        ctx.events.on('orders-applied', emitSpy);
        const q = new OrderQueueController(ctx);
        const row = { idHash: 'h1', atTick: 5, order: makeOrder('u'), appliedLocally: false };
        q.applyDeferredRowLocallyIfNeeded(row);
        expect(row.appliedLocally).toBe(true);
        expect(ctx.session.applyRemoteOrders).toHaveBeenCalledWith([{ atTick: 5, order: row.order }]);
        expect(emitSpy).toHaveBeenCalledWith({ count: 1, source: 'submit' });

        q.applyDeferredRowLocallyIfNeeded(row);
        expect(ctx.session.applyRemoteOrders).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledTimes(1);
    });
});

describe('OrderQueueController.emitHostCatchupWaitState', () => {
    it('reports blocking=true with the max queued tick when deferred orders exist', () => {
        const ctx = makeCtx();
        const cb = vi.fn();
        ctx.events.on('host-catchup-wait', cb);
        const q = new OrderQueueController(ctx);
        q.deferLocalOrder('h1', 5, makeOrder('u'), false);
        q.deferLocalOrder('h2', 10, makeOrder('u'), false);
        q.emitHostCatchupWaitState();
        expect(cb).toHaveBeenCalledWith({
            blocking: true,
            stuckHeartbeats: 0,
            hostTick: 0,
            targetTick: 10,
            queuedCount: 2,
        });
    });

    it('reports blocking=false with null targetTick when nothing is queued', () => {
        const ctx = makeCtx();
        const cb = vi.fn();
        ctx.events.on('host-catchup-wait', cb);
        new OrderQueueController(ctx).emitHostCatchupWaitState();
        expect(cb).toHaveBeenCalledWith({
            blocking: false,
            stuckHeartbeats: 0,
            hostTick: 0,
            targetTick: null,
            queuedCount: 0,
        });
    });
});

describe('OrderQueueController.resetLocalOptimisticOrdersOnResync', () => {
    it('clears in-flight tracking and counters but preserves deferred orders', () => {
        const q = new OrderQueueController(makeCtx());
        q.getAppliedOrderIdHashes().add('h1');
        q.getOurOrdersAwaitingServerRange().add('h1');
        q.getServerRangeConfirmedOurOrderHashes().add('h2');
        q.setHostCatchupHeartbeatStreak(3);
        q.setLastOrderFetchSince(20);
        q.setLastSeenOrdersRecordCount(7);
        q.setDeferredFlushBlockedLogKey('key');
        q.deferLocalOrder('h3', 5, makeOrder('u'), false);

        q.resetLocalOptimisticOrdersOnResync();

        expect(q.getAppliedOrderIdHashes().size).toBe(0);
        expect(q.getOurOrdersAwaitingServerRange().size).toBe(0);
        expect(q.getServerRangeConfirmedOurOrderHashes().size).toBe(0);
        expect(q.getHostCatchupHeartbeatStreak()).toBe(0);
        expect(q.getLastOrderFetchSince()).toBe(0);
        expect(q.getLastSeenOrdersRecordCount()).toBe(0);
        expect(q.getDeferredFlushBlockedLogKey()).toBeNull();
        expect(q.getDeferredLocalOrders()).toHaveLength(1);
    });
});

describe('OrderQueueController.engineOrderSyncPauseSummary', () => {
    it('returns the null marker when sim has no parallel batch', () => {
        const ctx = makeCtx();
        const q = new OrderQueueController(ctx);
        expect(q.engineOrderSyncPauseSummary()).toMatch(/waitingForOrders=null/);
    });

    it('summarises waiter ids when sim has a parallel batch', () => {
        const ctx = makeCtx();
        (ctx.session.getWaitingForOrdersBatch as unknown as ReturnType<typeof vi.fn>) = vi.fn(() => ({
            atTick: 7,
            waiters: [{ unitId: 'u1' }, { unitId: 'u2' }],
        }));
        const q = new OrderQueueController(ctx);
        const s = q.engineOrderSyncPauseSummary();
        expect(s).toContain('atTick=7');
        expect(s).toContain('u1,u2');
        expect(s).toContain('2 waiter(s)');
    });
});

describe('OrderQueueController.seedAppliedHashesForMergedOrdersThroughTick', () => {
    it('adds id hashes for rows with atTick <= maxAtTick without applying orders', async () => {
        const ctx = makeCtx();
        const applySpy = vi.spyOn(ctx.session, 'applyRemoteOrders');
        (ctx.api.getBattleOrdersRange as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            orders: [
                { atTick: 4, playerId: 'p1', idHash: 'a', order: makeOrder('u1') },
                { atTick: 10, playerId: 'p2', idHash: 'b', order: makeOrder('u2') },
            ],
        });
        const q = new OrderQueueController(ctx);
        await q.seedAppliedHashesForMergedOrdersThroughTick(5);
        expect(q.getAppliedOrderIdHashes().has('a')).toBe(true);
        expect(q.getAppliedOrderIdHashes().has('b')).toBe(false);
        expect(applySpy).not.toHaveBeenCalled();
        expect(ctx.api.getBattleOrdersRange).toHaveBeenCalledWith('l1', 'g1', { playerId: 'p1', untilTick: 5 });
    });

    it('returns early without HTTP for negative maxAtTick', async () => {
        const ctx = makeCtx();
        const q = new OrderQueueController(ctx);
        await q.seedAppliedHashesForMergedOrdersThroughTick(-1);
        expect(ctx.api.getBattleOrdersRange).not.toHaveBeenCalled();
    });
});
