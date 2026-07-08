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
        seedRemoteOrderDedupeKeys: vi.fn(),
        applyRemoteOrders: vi.fn().mockReturnValue({ newlyAppliedKeys: [], skippedKeys: [] }),
        isPausedForOrderSync: () => false,
        getWaitingForOrdersBatch: () => null,
        isDebugSimulationFrozen: () => false,
        isEngineSimulationRunning: () => false,
        isInteractiveTargetingPreviewActive: () => false,
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
        appendLobbyLog: vi.fn(async () => undefined),
        appendLobbyLogBatch: vi.fn(async () => undefined),
    } as BattleApi;
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
            return syncReconcilerRef.current!;
        },
        heartbeatHttp,
        heartbeatState,
        fingerprintBatcher,
        snapshotPersistence,
        isRecovering: false,
        requestResync,
        softAlignToHostPausePlane: vi.fn(),
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
        vi.mocked(ctx.session.applyRemoteOrders).mockReturnValue({
            newlyAppliedKeys: ['h1'],
            skippedKeys: [],
        });
        const emitSpy = vi.fn();
        ctx.events.on('orders-applied', emitSpy);
        const q = new OrderQueueController(ctx);
        const row = { idHash: 'h1', atTick: 5, order: makeOrder('u'), appliedLocally: false };
        expect(q.applyDeferredRowLocallyIfNeeded(row)).toBe(false);
        expect(row.appliedLocally).toBe(true);
        expect(ctx.session.applyRemoteOrders).toHaveBeenCalledWith([
            { atTick: 5, order: row.order, idHash: 'h1', playerId: 'p1' },
        ]);
        expect(emitSpy).toHaveBeenCalledWith({ count: 1, source: 'submit' });

        expect(q.applyDeferredRowLocallyIfNeeded(row)).toBe(false);
        expect(ctx.session.applyRemoteOrders).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    it('skips clamp-apply when atTick is behind local engine tick (lobby 39E984)', () => {
        const ctx = makeCtx();
        ctx.session.getEngineTick = () => 119;
        const q = new OrderQueueController(ctx);
        const row = { idHash: 'h94', atTick: 94, order: makeOrder('u1'), appliedLocally: false };
        expect(q.applyDeferredRowLocallyIfNeeded(row)).toBe(true);
        expect(row.appliedLocally).toBe(true);
        expect(ctx.session.applyRemoteOrders).not.toHaveBeenCalled();
        expect(q.getAppliedOrderIdHashes().has('h94')).toBe(true);
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

describe('OrderQueueController.hasDeferredOrderFor', () => {
    it('returns true when a deferred row matches unitId and atTick', () => {
        const q = new OrderQueueController(makeCtx());
        q.deferLocalOrder('h1', 5, makeOrder('u_match'), false);
        q.deferLocalOrder('h2', 6, makeOrder('u_other'), false);
        expect(q.hasDeferredOrderFor('u_match', 5)).toBe(true);
    });

    it('returns false when unitId or atTick does not match any deferred row', () => {
        const q = new OrderQueueController(makeCtx());
        q.deferLocalOrder('h1', 5, makeOrder('u1'), false);
        expect(q.hasDeferredOrderFor('u1', 6)).toBe(false);
        expect(q.hasDeferredOrderFor('u2', 5)).toBe(false);
        expect(q.hasDeferredOrderFor('u2', 6)).toBe(false);
    });
});

describe('OrderQueueController.acceptedOurPostAtTicks', () => {
    it('notes and queries accepted POST atTick', () => {
        const q = new OrderQueueController(makeCtx());
        expect(q.hasAcceptedOurPostAtTick(7)).toBe(false);
        q.noteAcceptedOurPostAtTick(7);
        expect(q.hasAcceptedOurPostAtTick(7)).toBe(true);
        expect(q.hasAcceptedOurPostAtTick(8)).toBe(false);
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

    it('clears accepted-post ticks while preserving deferred rows', () => {
        const q = new OrderQueueController(makeCtx());
        q.noteAcceptedOurPostAtTick(11);
        q.noteAcceptedOurPostAtTick(12);
        q.deferLocalOrder('h_deferred', 11, makeOrder('u_deferred'), true);

        q.resetLocalOptimisticOrdersOnResync();

        expect(q.hasAcceptedOurPostAtTick(11)).toBe(false);
        expect(q.hasAcceptedOurPostAtTick(12)).toBe(false);
        expect(q.getDeferredLocalOrders()).toHaveLength(1);
        expect(q.getDeferredLocalOrders()[0]?.order.unitId).toBe('u_deferred');
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
        const seedDedupeSpy = vi.spyOn(ctx.session, 'seedRemoteOrderDedupeKeys');
        await q.seedAppliedHashesForMergedOrdersThroughTick(5);
        expect(q.getAppliedOrderIdHashes().has('a')).toBe(true);
        expect(q.getAppliedOrderIdHashes().has('b')).toBe(false);
        expect(applySpy).not.toHaveBeenCalled();
        expect(seedDedupeSpy).toHaveBeenCalledWith(['a']);
        expect(ctx.api.getBattleOrdersRange).toHaveBeenCalledWith('l1', 'g1', { playerId: 'p1', untilTick: 5 });
    });

    it('returns early without HTTP for negative maxAtTick', async () => {
        const ctx = makeCtx();
        const q = new OrderQueueController(ctx);
        await q.seedAppliedHashesForMergedOrdersThroughTick(-1);
        expect(ctx.api.getBattleOrdersRange).not.toHaveBeenCalled();
    });
});
