import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BattleEventBus } from './BattleEventBus';
import { FingerprintBatcher } from './FingerprintBatcher';
import { HeartbeatHttp } from './HeartbeatHttp';
import { HeartbeatState } from './HeartbeatState';
import { OrderQueueController } from './OrderQueueController';
import { PollLoop } from './PollLoop';
import { SnapshotPersistence } from './SnapshotPersistence';
import { SyncReconciler } from './SyncReconciler';
import { SyncStatusController } from './SyncStatusController';
import type { BattleNetContext } from './BattleNetContext';
import type { BattleApi, BattleNetEventMap, BattleSessionHandle } from './types';
import type { SerializedGameState } from '../types';

function makeSession(overrides: Partial<BattleSessionHandle> = {}): BattleSessionHandle {
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
        applyRemoteOrders: () => ({ newlyAppliedKeys: [], skippedKeys: [] }),
        isPausedForOrderSync: () => false,
        getWaitingForOrdersBatch: () => null,
        isDebugSimulationFrozen: () => false,
        isEngineSimulationRunning: () => false,
        setMultiplayerAwaitHostCatchup: () => {},
        ...overrides,
    };
}

function makeApi(): BattleApi {
    const api = {
        appendLobbyLog: vi.fn(async () => ({ success: true })),
        appendBattleOrder: vi.fn(),
        getBattleOrdersRange: vi.fn(async () => ({ orders: [] })),
        getBattleSnapshot: vi.fn(async () => null),
        getBattleHeartbeat: vi.fn(),
        mergeBattleAppliedOrders: vi.fn(),
        saveBattleInitialState: vi.fn(),
        getBattleInitialState: vi.fn(),
        saveBattleSnapshot: vi.fn(),
        appendBattleFingerprints: vi.fn(),
        getBattleFingerprintsRange: vi.fn(),
    };
    return api as unknown as BattleApi;
}

interface Harness {
    ctx: BattleNetContext;
    loop: PollLoop;
    orderQueue: OrderQueueController;
    syncReconciler: SyncReconciler;
    pollOnce: ReturnType<typeof vi.fn>;
}

function makeHarness(opts: {
    isHost?: boolean;
    isRecovering?: boolean;
    sessionOverrides?: Partial<BattleSessionHandle>;
    pollOnceImpl?: () => Promise<void>;
} = {}): Harness {
    const events = new BattleEventBus();
    const api = makeApi();
    const session = makeSession(opts.sessionOverrides ?? {});
    const syncReconcilerRef: { current?: SyncReconciler } = {};
    const ctx: BattleNetContext = {
        api,
        session,
        isHost: opts.isHost ?? false,
        lobbyId: 'l1',
        gameId: 'g1',
        playerId: 'p1',
        heartbeatTraceInstanceId: 1,
        events,
        syncStatus: new SyncStatusController(events),
        get syncReconciler() {
            return syncReconcilerRef.current!;
        },
        heartbeatHttp: new HeartbeatHttp({
            api,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
            heartbeatTraceInstanceId: 1,
        }),
        heartbeatState: new HeartbeatState(),
        fingerprintBatcher: new FingerprintBatcher({
            api,
            isHost: opts.isHost ?? false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        }),
        snapshotPersistence: new SnapshotPersistence({
            api,
            session,
            isHost: opts.isHost ?? false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
            requestResync: () => {},
        }),
        isRecovering: opts.isRecovering ?? false,
        requestResync: () => {},
        notePreviouslySyncedAnchorTick: vi.fn(),
        resetForDesyncRecoveryEntry: vi.fn(),
    };
    const orderQueue = new OrderQueueController(ctx);
    syncReconcilerRef.current = new SyncReconciler(ctx);
    const syncReconciler = syncReconcilerRef.current;
    const pollOnce = vi.fn(async (..._args: unknown[]) => {
        if (opts.pollOnceImpl) {
            return opts.pollOnceImpl();
        }
    });
    const loop = new PollLoop(ctx, {
        orderQueue,
        syncReconciler,
        pollOnce: pollOnce as unknown as (opts?: unknown) => Promise<void>,
    });
    return { ctx, loop, orderQueue, syncReconciler, pollOnce };
}

describe('PollLoop.bindSiblings', () => {
    it('throws if needsActiveHeartbeatPolling is called before bindSiblings', () => {
        const events = new BattleEventBus();
        const api = makeApi();
        const session = makeSession();
        const syncReconcilerRef: { current?: SyncReconciler } = {};
        const ctx: BattleNetContext = {
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
            heartbeatTraceInstanceId: 1,
            events,
            syncStatus: new SyncStatusController(events),
            get syncReconciler() {
                return syncReconcilerRef.current!;
            },
            heartbeatHttp: new HeartbeatHttp({
                api,
                lobbyId: 'l1',
                gameId: 'g1',
                playerId: 'p1',
                heartbeatTraceInstanceId: 1,
            }),
            heartbeatState: new HeartbeatState(),
            fingerprintBatcher: new FingerprintBatcher({
                api,
                isHost: false,
                lobbyId: 'l1',
                gameId: 'g1',
                playerId: 'p1',
            }),
            snapshotPersistence: new SnapshotPersistence({
                api,
                session,
                isHost: false,
                lobbyId: 'l1',
                gameId: 'g1',
                playerId: 'p1',
                requestResync: () => {},
            }),
            isRecovering: false,
            requestResync: () => {},
            notePreviouslySyncedAnchorTick: vi.fn(),
            resetForDesyncRecoveryEntry: vi.fn(),
        };
        syncReconcilerRef.current = new SyncReconciler(ctx);
        const loop = new PollLoop(ctx);
        expect(() => loop.needsActiveHeartbeatPolling()).toThrow(/bindSiblings/);
    });
});

describe('PollLoop.needsActiveHeartbeatPolling', () => {
    it('returns true when recovery is active', () => {
        const h = makeHarness({ isRecovering: true });
        expect(h.loop.needsActiveHeartbeatPolling()).toBe(true);
    });

    it('returns true when the session is paused for order sync', () => {
        const h = makeHarness({ sessionOverrides: { isPausedForOrderSync: () => true } });
        expect(h.loop.needsActiveHeartbeatPolling()).toBe(true);
    });

    it('returns true for non-host when deferred orders are queued', () => {
        const h = makeHarness({ isHost: false });
        h.orderQueue.deferLocalOrder('h1', 5, { unitId: 'u1', abilityId: 'fireball', targets: [] }, false);
        expect(h.loop.needsActiveHeartbeatPolling()).toBe(true);
    });

    it('returns false for host when nothing requires foreground polling', () => {
        const h = makeHarness({
            isHost: true,
            sessionOverrides: { isEngineSimulationRunning: () => true },
        });
        expect(h.loop.needsActiveHeartbeatPolling()).toBe(false);
    });

    it('returns true for non-host while engine simulation is running', () => {
        const h = makeHarness({
            isHost: false,
            sessionOverrides: { isEngineSimulationRunning: () => true },
        });
        expect(h.loop.needsActiveHeartbeatPolling()).toBe(true);
    });

    it('returns false for non-host when engine is idle and nothing else triggers active polling', () => {
        const h = makeHarness({ isHost: false });
        expect(h.loop.needsActiveHeartbeatPolling()).toBe(false);
    });
});

describe('PollLoop.start / stop', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('starts inactive and becomes active after start', () => {
        const h = makeHarness();
        expect(h.loop.isActive()).toBe(false);
        h.loop.start();
        expect(h.loop.isActive()).toBe(true);
        h.loop.stop();
    });

    it('start() ignores a second call while already active', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const h = makeHarness();
        h.loop.start();
        h.loop.start();
        expect(warnSpy).toHaveBeenCalledWith(
            '[BattleNet] start() ignored — heartbeat poll already active',
            expect.any(Object),
        );
        h.loop.stop();
        warnSpy.mockRestore();
    });

    it('invokes pollOnce immediately when starting', () => {
        const h = makeHarness();
        h.loop.start();
        expect(h.pollOnce).toHaveBeenCalledWith({ pollSource: 'timer' });
        h.loop.stop();
    });

    it('resets streak/key state owned by siblings + waitingForHostUiPollStreak', () => {
        const h = makeHarness({ isHost: false });
        h.orderQueue.setHostCatchupHeartbeatStreak(3);
        h.loop.waitingForHostUiPollStreak = 7;
        h.syncReconciler.setLastPollServerTailKey('something');
        h.syncReconciler.setAheadWithUnchangedServerTailStreak(5);
        h.syncReconciler.setLastNonHostHbPausePlane({
            hostPaused: true,
            hostTick: 1,
            hostFingerprint: 'fp',
            orderBatchAtTick: 2,
            expectingFromPlayerIds: ['p1'],
        });
        h.loop.start();
        expect(h.orderQueue.getHostCatchupHeartbeatStreak()).toBe(0);
        expect(h.loop.waitingForHostUiPollStreak).toBe(0);
        expect(h.syncReconciler.getLastPollServerTailKey()).toBeNull();
        expect(h.syncReconciler.getAheadWithUnchangedServerTailStreak()).toBe(0);
        expect(h.syncReconciler.getLastNonHostHbPausePlane()).toBeNull();
        h.loop.stop();
    });

    it('host start() does not clear lastNonHostHbPausePlane', () => {
        const h = makeHarness({ isHost: true });
        const plane = {
            hostPaused: true,
            hostTick: 1,
            hostFingerprint: 'fp',
            orderBatchAtTick: 2,
            expectingFromPlayerIds: ['p1'],
        };
        h.syncReconciler.setLastNonHostHbPausePlane(plane);
        h.loop.start();
        expect(h.syncReconciler.getLastNonHostHbPausePlane()).toBe(plane);
        h.loop.stop();
    });

    it('stop() turns the loop inactive and clears the scheduled timer', () => {
        const h = makeHarness();
        h.loop.start();
        h.loop.stop();
        expect(h.loop.isActive()).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('PollLoop.publishSyncDebugBridge', () => {
    let originalWindow: unknown;

    beforeEach(() => {
        originalWindow = (globalThis as unknown as { window?: unknown }).window;
        (globalThis as unknown as { window: Record<string, unknown> }).window = {};
    });

    afterEach(() => {
        if (originalWindow === undefined) {
            delete (globalThis as unknown as { window?: unknown }).window;
        } else {
            (globalThis as unknown as { window: unknown }).window = originalWindow;
        }
    });

    function hb(overrides: Partial<BattleNetEventMap['heartbeat']> = {}): BattleNetEventMap['heartbeat'] {
        return {
            hostTick: 0,
            hostFingerprint: null,
            hostPaused: false,
            ordersTipTick: 0,
            ordersRecordCount: null,
            orderBatchAtTick: null,
            pausedAtTick: null,
            expectingFromPlayerIds: null,
            initialFingerprint: null,
            heartbeatSeq: 0,
            fingerprintTailTick: null,
            fingerprintTailFingerprint: null,
            ...overrides,
        };
    }

    it('writes a snapshot of sync state to window.__minionBattlesSyncDebug', () => {
        const h = makeHarness({ isHost: false });
        h.loop.publishSyncDebugBridge(hb({ hostTick: 5, hostFingerprint: 'fp5' }));
        const bridge = (globalThis as unknown as {
            window: { __minionBattlesSyncDebug: Record<string, unknown> };
        }).window.__minionBattlesSyncDebug;
        expect(bridge).toMatchObject({
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
            isHost: false,
            deferredOrderCount: 0,
            engineTick: 0,
            clientTick: 0,
        });
        expect(bridge.lastHeartbeat).toMatchObject({ hostTick: 5, hostFingerprint: 'fp5' });
    });

    it('includes deferred order count and order sync summary from the order queue', () => {
        const h = makeHarness();
        h.orderQueue.deferLocalOrder('h1', 3, { unitId: 'u', abilityId: 'fireball', targets: [] }, false);
        h.loop.publishSyncDebugBridge(hb());
        const bridge = (globalThis as unknown as {
            window: { __minionBattlesSyncDebug: Record<string, unknown> };
        }).window.__minionBattlesSyncDebug;
        expect(bridge.deferredOrderCount).toBe(1);
        expect(bridge.orderSyncSummary).toEqual({ queued: 1, sending: 0 });
    });
});
