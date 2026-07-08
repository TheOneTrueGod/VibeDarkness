import { describe, it, expect, vi, afterEach } from 'vitest';
import { BattleEventBus } from './BattleEventBus';
import { FingerprintBatcher } from './FingerprintBatcher';
import { HeartbeatHttp } from './HeartbeatHttp';
import { HeartbeatState } from './HeartbeatState';
import { OrderQueueController } from './OrderQueueController';
import { RecoveryCoordinator } from './RecoveryCoordinator';
import { SnapshotPersistence } from './SnapshotPersistence';
import { SyncReconciler } from './SyncReconciler';
import { SyncStatusController } from './SyncStatusController';
import type { BattleNetContext } from './BattleNetContext';
import type { BattleApi, BattleSessionHandle } from './types';
import type { BattleOrder, SerializedGameState } from '../types';

function makeOrder(unitId: string): BattleOrder {
    return { unitId, abilityId: 'fireball', targets: [] };
}

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
        seedRemoteOrderDedupeKeys: () => {},
        applyRemoteOrders: () => ({ newlyAppliedKeys: [], skippedKeys: [] }),
        isPausedForOrderSync: () => false,
        getWaitingForOrdersBatch: () => null,
        isDebugSimulationFrozen: () => false,
        isEngineSimulationRunning: () => false,
        isInteractiveTargetingPreviewActive: () => false,
        setMultiplayerAwaitHostCatchup: () => {},
        ...overrides,
    };
}

function makeApi(overrides: Partial<Record<keyof BattleApi, unknown>> = {}): BattleApi {
    const api = {
        appendLobbyLog: vi.fn(async () => ({ success: true })),
        appendLobbyLogBatch: vi.fn(async () => ({ success: true })),
        appendBattleOrder: vi.fn(async () => ({ accepted: true, idHash: 'x' })),
        getBattleOrdersRange: vi.fn(async () => ({ orders: [] })),
        getBattleSnapshot: vi.fn(async () => null),
        getBattleHeartbeat: vi.fn(async () => ({
            hostTick: 0,
            hostFingerprint: null,
            hostPaused: false,
            ordersTipTick: 0,
            ordersRecordCount: 0,
            orderBatchAtTick: null,
            pausedAtTick: null,
            expectingFromPlayerIds: null,
            initialFingerprint: null,
            heartbeatSeq: 0,
        })),
        mergeBattleAppliedOrders: vi.fn(async () => ({ success: true, merged: 0 })),
        saveBattleInitialState: vi.fn(async () => {}),
        getBattleInitialState: vi.fn(async () => null),
        saveBattleSnapshot: vi.fn(async () => {}),
        appendBattleFingerprints: vi.fn(async () => ({ appended: 0 })),
        getBattleFingerprintsRange: vi.fn(async () => ({ records: [] })),
        ...overrides,
    };
    return api as unknown as BattleApi;
}

interface Harness {
    ctx: BattleNetContext;
    api: BattleApi;
    session: BattleSessionHandle;
    orderQueue: OrderQueueController;
    syncReconciler: SyncReconciler;
    coordinator: RecoveryCoordinator;
    statusCallback: ReturnType<typeof vi.fn>;
}

function makeHarness(opts: {
    apiOverrides?: Partial<Record<keyof BattleApi, unknown>>;
    sessionOverrides?: Partial<BattleSessionHandle>;
} = {}): Harness {
    const events = new BattleEventBus();
    const api = makeApi(opts.apiOverrides ?? {});
    const session = makeSession(opts.sessionOverrides ?? {});
    const heartbeatState = new HeartbeatState();
    const orderQueueRef: { current?: OrderQueueController } = {};
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
        heartbeatState,
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
        softAlignToHostPausePlane: () => {},
        notePreviouslySyncedAnchorTick: vi.fn(),
        resetForDesyncRecoveryEntry(): void {
            orderQueueRef.current?.resetLocalOptimisticOrdersOnResync();
            syncReconcilerRef.current?.resetNonHostAheadStreak();
            heartbeatState.resetMaterialTracking();
            syncReconcilerRef.current?.setLastNonHostHbPausePlane(null);
        },
    };
    const orderQueue = new OrderQueueController(ctx);
    orderQueueRef.current = orderQueue;
    syncReconcilerRef.current = new SyncReconciler(ctx);
    const syncReconciler = syncReconcilerRef.current;
    const coordinator = new RecoveryCoordinator(ctx, { orderQueue, syncReconciler });
    const statusCallback = vi.fn();
    events.on('sync-status', statusCallback);
    return { ctx, api, session, orderQueue, syncReconciler, coordinator, statusCallback };
}

describe('RecoveryCoordinator.noteRecoveryAttempt', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns false for the first three attempts in the window and true on the fourth', () => {
        const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(10_000);
        const { coordinator } = makeHarness();
        expect(coordinator.noteRecoveryAttempt('reason')).toBe(false);
        expect(coordinator.noteRecoveryAttempt('reason')).toBe(false);
        expect(coordinator.noteRecoveryAttempt('reason')).toBe(false);
        expect(coordinator.noteRecoveryAttempt('reason')).toBe(true);
        dateSpy.mockRestore();
    });

    it('drops attempts that fall outside the 30s window before counting', () => {
        const dateSpy = vi.spyOn(Date, 'now');
        const { coordinator } = makeHarness();
        dateSpy.mockReturnValue(0);
        coordinator.noteRecoveryAttempt('reason');
        coordinator.noteRecoveryAttempt('reason');
        coordinator.noteRecoveryAttempt('reason');
        dateSpy.mockReturnValue(60_000);
        expect(coordinator.noteRecoveryAttempt('reason')).toBe(false);
        dateSpy.mockRestore();
    });

    it('tracks attempts per reason independently', () => {
        const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(10_000);
        const { coordinator } = makeHarness();
        coordinator.noteRecoveryAttempt('reasonA');
        coordinator.noteRecoveryAttempt('reasonA');
        coordinator.noteRecoveryAttempt('reasonA');
        expect(coordinator.noteRecoveryAttempt('reasonA')).toBe(true);
        expect(coordinator.noteRecoveryAttempt('reasonB')).toBe(false);
        dateSpy.mockRestore();
    });
});

describe('RecoveryCoordinator.isRecovering', () => {
    it('starts false', () => {
        const { coordinator } = makeHarness();
        expect(coordinator.isRecovering).toBe(false);
    });

    it('reflects manual setIsRecovering calls', () => {
        const { coordinator } = makeHarness();
        coordinator.setIsRecovering(true);
        expect(coordinator.isRecovering).toBe(true);
        coordinator.setIsRecovering(false);
        expect(coordinator.isRecovering).toBe(false);
    });
});

describe('RecoveryCoordinator.tryBootstrapFromLatestCheckpoint', () => {
    it('returns false and clears bootstrap tick when no snapshot exists', async () => {
        const h = makeHarness({
            apiOverrides: { getBattleSnapshot: vi.fn(async () => null) },
        });
        h.ctx.snapshotPersistence.setLastBootstrapSnapshotTick(99);
        const result = await h.coordinator.tryBootstrapFromLatestCheckpoint();
        expect(result).toBe(false);
        expect(h.ctx.snapshotPersistence.getLastBootstrapSnapshotTick()).toBeNull();
    });

    it('loads snapshot, seeds merged orders through checkpoint tick, replays since snapshot.tick + 1, and primes fetch cursor', async () => {
        const loadFromSnapshot = vi.fn();
        const applyRemoteOrders = vi.fn().mockReturnValue({ newlyAppliedKeys: [], skippedKeys: [] });
        const getBattleOrdersRange = vi.fn(
            async (_l: string, _g: string, params: { sinceTick?: number; untilTick?: number }) => {
                if (params.untilTick === 5 && params.sinceTick === undefined) {
                    return {
                        orders: [{ atTick: 5, playerId: 'p2', idHash: 'seed1', order: makeOrder('pre') }],
                    };
                }
                if (params.sinceTick === 6) {
                    return { orders: [{ atTick: 6, playerId: 'p2', idHash: 'o1', order: makeOrder('r1') }] };
                }
                return { orders: [] };
            },
        );
        const h = makeHarness({
            apiOverrides: {
                getBattleSnapshot: vi.fn(async () => ({
                    tick: 5,
                    state: { gameTick: 5 } as SerializedGameState,
                    synchash: 'snap_fp',
                })),
                getBattleOrdersRange,
            },
            sessionOverrides: { loadFromSnapshot, applyRemoteOrders },
        });
        const result = await h.coordinator.tryBootstrapFromLatestCheckpoint();
        expect(result).toBe(true);
        expect(loadFromSnapshot).toHaveBeenCalledWith(
            { gameTick: 5 } as SerializedGameState,
            { checkpointRuntimeFingerprintHex: 'snap_fp' },
        );
        expect(getBattleOrdersRange).toHaveBeenNthCalledWith(1, 'l1', 'g1', {
            playerId: 'p1',
            untilTick: 5,
        });
        expect(getBattleOrdersRange).toHaveBeenNthCalledWith(2, 'l1', 'g1', { playerId: 'p1', sinceTick: 6 });
        expect(h.orderQueue.getAppliedOrderIdHashes().has('seed1')).toBe(true);
        expect(applyRemoteOrders).toHaveBeenCalledWith([
            { atTick: 6, order: makeOrder('r1'), idHash: 'o1', playerId: 'p2' },
        ]);
        expect(h.ctx.snapshotPersistence.getLastBootstrapSnapshotTick()).toBe(5);
        expect(h.orderQueue.getLastOrderFetchSince()).toBe(7);
        expect(h.orderQueue.getLastSeenOrdersRecordCount()).toBe(0);
    });

    it('clears in-flight order tracking before applying snapshot', async () => {
        const h = makeHarness({
            apiOverrides: {
                getBattleSnapshot: vi.fn(async () => ({
                    tick: 3,
                    state: { gameTick: 3 } as SerializedGameState,
                    synchash: null,
                })),
            },
        });
        h.orderQueue.getOurOrdersAwaitingServerRange().add('h1');
        h.orderQueue.getServerRangeConfirmedOurOrderHashes().add('h2');
        await h.coordinator.tryBootstrapFromLatestCheckpoint();
        expect(h.orderQueue.getOurOrdersAwaitingServerRange().size).toBe(0);
        expect(h.orderQueue.getServerRangeConfirmedOurOrderHashes().size).toBe(0);
    });
});

describe('RecoveryCoordinator.runDesyncRecovery', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('escalates to failed status when attempt budget is exceeded', async () => {
        const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(0);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const h = makeHarness();
        for (let i = 0; i < 4; i++) {
            h.coordinator.noteRecoveryAttempt('reason');
        }
        await h.coordinator.runDesyncRecovery('reason');
        expect(h.statusCallback).toHaveBeenLastCalledWith('failed');
        expect(h.coordinator.isRecovering).toBe(false);
        dateSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('emits resyncing, runs initial-state mismatch path, and finalizes with success', async () => {
        const loadFromSnapshot = vi.fn();
        const applyRemoteOrders = vi.fn().mockReturnValue({ newlyAppliedKeys: [], skippedKeys: [] });
        const getBattleSnapshot = vi.fn(async () => null);
        const getBattleInitialState = vi.fn(async () => ({
            state: { gameTick: 0 } as SerializedGameState,
            initialFingerprint: '0011223344556677',
        }));
        const getBattleHeartbeat = vi.fn(async () => ({
            hostTick: 0,
            hostFingerprint: 'aligned',
            hostPaused: false,
            ordersTipTick: 0,
            ordersRecordCount: 0,
            orderBatchAtTick: null,
            pausedAtTick: null,
            expectingFromPlayerIds: null,
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 0,
        }));
        const h = makeHarness({
            apiOverrides: { getBattleSnapshot, getBattleInitialState, getBattleHeartbeat },
            sessionOverrides: {
                loadFromSnapshot,
                applyRemoteOrders,
                getLatestFingerprint: () => ({ tick: 0, fp: 'aligned', paused: false }),
            },
        });
        await h.coordinator.runDesyncRecovery('initial-state-mismatch');
        expect(getBattleSnapshot).toHaveBeenCalled();
        expect(getBattleInitialState).toHaveBeenCalled();
        expect(loadFromSnapshot).toHaveBeenCalled();
        const statuses = h.statusCallback.mock.calls.map((c) => c[0]);
        expect(statuses).toContain('resyncing');
        expect(h.coordinator.isRecovering).toBe(false);
    });

    it('prefers latest checkpoint snapshot before falling back to targeted snapshot', async () => {
        const loadFromSnapshot = vi.fn();
        const applyRemoteOrders = vi.fn().mockReturnValue({ newlyAppliedKeys: [], skippedKeys: [] });
        const getBattleSnapshot = vi.fn(async () => ({
            tick: 1,
            state: { gameTick: 1 } as SerializedGameState,
            synchash: null,
        }));
        const getBattleOrdersRange = vi.fn(
            async (_l: string, _g: string, params: { sinceTick?: number; untilTick?: number }) => {
                if (params.untilTick === 1 && params.sinceTick === undefined) {
                    return { orders: [] };
                }
                if (params.sinceTick === 2) {
                    return { orders: [{ atTick: 2, playerId: 'p2', idHash: 'z1', order: makeOrder('r1') }] };
                }
                return { orders: [] };
            },
        );
        const getBattleFingerprintsRange = vi.fn(async () => ({ records: [{ tick: 1, fp: 'server1' }] }));
        const getBattleHeartbeat = vi.fn(async () => ({
            hostTick: 1,
            hostFingerprint: 'aligned1',
            hostPaused: false,
            ordersTipTick: 2,
            ordersRecordCount: 0,
            orderBatchAtTick: null,
            pausedAtTick: null,
            expectingFromPlayerIds: null,
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 0,
        }));
        const h = makeHarness({
            apiOverrides: {
                getBattleSnapshot,
                getBattleOrdersRange,
                getBattleFingerprintsRange,
                getBattleHeartbeat,
            },
            sessionOverrides: {
                getEngineTick: () => 1,
                getFingerprintRange: () => [{ tick: 1, fp: 'local1', paused: false }],
                getLatestFingerprint: () => ({ tick: 1, fp: 'aligned1', paused: false }),
                loadFromSnapshot,
                applyRemoteOrders,
            },
        });
        await h.coordinator.runDesyncRecovery('hash-mismatch');
        expect(getBattleSnapshot).toHaveBeenCalledTimes(1);
        expect(getBattleSnapshot).toHaveBeenCalledWith('l1', 'g1', { playerId: 'p1' });
        expect(applyRemoteOrders).toHaveBeenCalledWith([
            { atTick: 2, order: makeOrder('r1'), idHash: 'z1', playerId: 'p2' },
        ]);
    });

    it('keeps bootstrap success when still paused but host expects local player (lobby 39E984)', async () => {
        const loadFromSnapshot = vi.fn();
        const applyRemoteOrders = vi.fn().mockReturnValue({ newlyAppliedKeys: [], skippedKeys: [] });
        const getBattleSnapshot = vi.fn(async () => ({
            tick: 119,
            state: { gameTick: 119 } as SerializedGameState,
            synchash: 'fp119',
        }));
        const getBattleOrdersRange = vi.fn(async () => ({ orders: [] }));
        const getBattleFingerprintsRange = vi.fn(async () => ({
            records: [{ tick: 119, fp: 'fp119' }],
        }));
        const getBattleHeartbeat = vi.fn(async () => ({
            hostTick: 119,
            hostFingerprint: 'fp119',
            hostPaused: true,
            ordersTipTick: 120,
            ordersRecordCount: 0,
            orderBatchAtTick: 120,
            pausedAtTick: 120,
            expectingFromPlayerIds: ['p1'],
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 0,
        }));
        const h = makeHarness({
            apiOverrides: {
                getBattleSnapshot,
                getBattleOrdersRange,
                getBattleFingerprintsRange,
                getBattleHeartbeat,
            },
            sessionOverrides: {
                getEngineTick: () => 119,
                isPausedForOrderSync: () => true,
                getFingerprintRange: () => [{ tick: 119, fp: 'fp119', paused: true }],
                getLatestFingerprint: () => ({ tick: 119, fp: 'fp119', paused: true }),
                loadFromSnapshot,
                applyRemoteOrders,
            },
        });
        await h.coordinator.runDesyncRecovery('waiting-for-host-paused-stall');
        // Bootstrap only — no targeted atTick snapshot fetch.
        expect(getBattleSnapshot).toHaveBeenCalledTimes(1);
        expect(getBattleSnapshot).toHaveBeenCalledWith('l1', 'g1', { playerId: 'p1' });
        const statuses = h.statusCallback.mock.calls.map((c) => c[0]);
        expect(statuses).toContain('resyncing');
        expect(statuses).toContain('synced');
        expect(h.coordinator.isRecovering).toBe(false);
    });

    it('reloads the page when bootstrap and targeted snapshot both fail', async () => {
        const reload = vi.fn();
        vi.stubGlobal('window', { location: { reload } });
        const getBattleSnapshot = vi.fn(async () => null);
        const getBattleInitialState = vi.fn(async () => ({
            state: { gameTick: 0 } as SerializedGameState,
            initialFingerprint: '0011223344556677',
        }));
        const getBattleFingerprintsRange = vi.fn(async () => ({ records: [{ tick: 75, fp: 'host75' }] }));
        const getBattleHeartbeat = vi.fn(async () => ({
            hostTick: 100,
            hostFingerprint: 'host100',
            hostPaused: false,
            ordersTipTick: 100,
            ordersRecordCount: 0,
            orderBatchAtTick: null,
            pausedAtTick: null,
            expectingFromPlayerIds: null,
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 0,
        }));
        const h = makeHarness({
            apiOverrides: {
                getBattleSnapshot,
                getBattleInitialState,
                getBattleFingerprintsRange,
                getBattleHeartbeat,
            },
            sessionOverrides: {
                getEngineTick: () => 100,
                getFingerprintRange: () => [{ tick: 75, fp: 'local75', paused: false }],
                getLatestFingerprint: () => ({ tick: 100, fp: 'host100', paused: false }),
            },
        });
        await h.coordinator.runDesyncRecovery('hash-mismatch');
        expect(getBattleSnapshot).toHaveBeenCalled();
        expect(getBattleInitialState).not.toHaveBeenCalled();
        expect(reload).toHaveBeenCalled();
        const statuses = h.statusCallback.mock.calls.map((c) => c[0]);
        expect(statuses).toContain('resyncing');
        expect(statuses).not.toContain('synced');
    });

    it('clears isRecovering flag in finally block even when caller throws', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const h = makeHarness({
            apiOverrides: {
                getBattleFingerprintsRange: vi.fn(async () => {
                    throw new Error('boom');
                }),
            },
        });
        await h.coordinator.runDesyncRecovery('hash-mismatch');
        expect(h.coordinator.isRecovering).toBe(false);
        expect(h.statusCallback).toHaveBeenLastCalledWith('failed');
        errorSpy.mockRestore();
    });
});

describe('RecoveryCoordinator.bindSiblings', () => {
    it('throws if tryBootstrapFromLatestCheckpoint is called before bindSiblings', async () => {
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
            softAlignToHostPausePlane: () => {},
            notePreviouslySyncedAnchorTick: vi.fn(),
            resetForDesyncRecoveryEntry: vi.fn(),
        };
        syncReconcilerRef.current = new SyncReconciler(ctx);
        const coordinator = new RecoveryCoordinator(ctx);
        await expect(coordinator.tryBootstrapFromLatestCheckpoint()).rejects.toThrow(/bindSiblings/);
    });
});
