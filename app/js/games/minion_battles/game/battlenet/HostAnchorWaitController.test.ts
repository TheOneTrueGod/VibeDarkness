import { describe, it, expect, vi, afterEach } from 'vitest';
import { BattleEventBus } from './BattleEventBus';
import { FingerprintBatcher } from './FingerprintBatcher';
import { HeartbeatHttp } from './HeartbeatHttp';
import { HeartbeatState } from './HeartbeatState';
import { HostAnchorWaitController } from './HostAnchorWaitController';
import { OrderQueueController } from './OrderQueueController';
import { SnapshotPersistence } from './SnapshotPersistence';
import { SyncReconciler } from './SyncReconciler';
import { SyncStatusController } from './SyncStatusController';
import { HOST_ANCHOR_RESYNC_MS, HOST_ANCHOR_WAIT_SHOW_MS } from './constants';
import type { BattleNetContext } from './BattleNetContext';
import type { BattleApi, BattleNetEventMap, BattleSessionHandle } from './types';
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

function makeApi(): BattleApi {
    const api = {
        appendLobbyLog: vi.fn(async () => ({ success: true })),
        appendLobbyLogBatch: vi.fn(async () => ({ success: true })),
        appendBattleOrder: vi.fn() as unknown as BattleApi['appendBattleOrder'],
        getBattleOrdersRange: vi.fn() as unknown as BattleApi['getBattleOrdersRange'],
        getBattleSnapshot: vi.fn() as unknown as BattleApi['getBattleSnapshot'],
        getBattleHeartbeat: vi.fn() as unknown as BattleApi['getBattleHeartbeat'],
        mergeBattleAppliedOrders: vi.fn() as unknown as BattleApi['mergeBattleAppliedOrders'],
        saveBattleInitialState: vi.fn() as unknown as BattleApi['saveBattleInitialState'],
        getBattleInitialState: vi.fn() as unknown as BattleApi['getBattleInitialState'],
        saveBattleSnapshot: vi.fn() as unknown as BattleApi['saveBattleSnapshot'],
        appendBattleFingerprints: vi.fn() as unknown as BattleApi['appendBattleFingerprints'],
        getBattleFingerprintsRange: vi.fn() as unknown as BattleApi['getBattleFingerprintsRange'],
    };
    return api as unknown as BattleApi;
}

interface HarnessOptions {
    session?: Partial<BattleSessionHandle>;
    isRecovering?: boolean;
}

interface Harness {
    ctx: BattleNetContext;
    requestResync: ReturnType<typeof vi.fn>;
    controller: HostAnchorWaitController;
    orderQueue: OrderQueueController;
    syncReconciler: SyncReconciler;
    eventCallback: ReturnType<typeof vi.fn>;
    blockingCallback: ReturnType<typeof vi.fn>;
}

function makeHarness(opts: HarnessOptions = {}): Harness {
    const events = new BattleEventBus();
    const api = makeApi();
    const session = makeSession(opts.session ?? {});
    const requestResync = vi.fn();
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
            requestResync,
        }),
        isRecovering: opts.isRecovering ?? false,
        requestResync,
        softAlignToHostPausePlane: vi.fn(),
        notePreviouslySyncedAnchorTick: vi.fn(),
        resetForDesyncRecoveryEntry: vi.fn(),
    };
    const orderQueue = new OrderQueueController(ctx);
    syncReconcilerRef.current = new SyncReconciler(ctx);
    const syncReconciler = syncReconcilerRef.current;
    const controller = new HostAnchorWaitController(ctx, { orderQueue, syncReconciler });
    const eventCallback = vi.fn();
    const blockingCallback = vi.fn();
    events.on('host-anchor-wait', eventCallback);
    events.on('blocking-host-pause-plane', blockingCallback);
    return { ctx, requestResync, controller, orderQueue, syncReconciler, eventCallback, blockingCallback };
}

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

describe('HostAnchorWaitController.bindSiblings', () => {
    it('throws if shouldTrackHostAnchorWallWait is called before bindSiblings', () => {
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
        const controller = new HostAnchorWaitController(ctx);
        controller.setPreviouslySyncedAtTick(10);
        expect(() =>
            controller.shouldTrackHostAnchorWallWait(10, hb({ hostTick: 10, hostPaused: true })),
        ).toThrow(/bindSiblings/);
    });
});

describe('HostAnchorWaitController.notePreviouslySyncedAnchorTick', () => {
    it('records the anchor tick and emits idle host-anchor-wait', () => {
        const h = makeHarness();
        h.controller.setHostAnchorWaitStartedAtMs(1234);
        h.controller.setHostAnchorResyncEmittedForCurrentStall(true);
        h.controller.notePreviouslySyncedAnchorTick(42);
        expect(h.controller.getPreviouslySyncedAtTick()).toBe(42);
        expect(h.controller.getHostAnchorWaitStartedAtMs()).toBeNull();
        expect(h.controller.getHostAnchorResyncEmittedForCurrentStall()).toBe(false);
        expect(h.eventCallback).toHaveBeenCalledWith({ phase: 'idle', elapsedMs: 0 });
    });
});

describe('HostAnchorWaitController.clearHostAnchorWaitState', () => {
    it('emits idle and resets wall-clock and dedup state', () => {
        const h = makeHarness();
        h.controller.setHostAnchorWaitStartedAtMs(5000);
        h.controller.setHostAnchorResyncEmittedForCurrentStall(true);
        h.controller.clearHostAnchorWaitState();
        expect(h.controller.getHostAnchorWaitStartedAtMs()).toBeNull();
        expect(h.controller.getHostAnchorResyncEmittedForCurrentStall()).toBe(false);
        expect(h.eventCallback).toHaveBeenCalledWith({ phase: 'idle', elapsedMs: 0 });
    });
});

describe('HostAnchorWaitController.shouldTrackHostAnchorWallWait', () => {
    it('returns false when no anchor has been recorded yet', () => {
        const h = makeHarness();
        expect(h.controller.shouldTrackHostAnchorWallWait(10, hb({ hostTick: 10, hostPaused: true }))).toBe(false);
    });

    it('returns false when host tick is not the anchor tick', () => {
        const h = makeHarness();
        h.controller.setPreviouslySyncedAtTick(10);
        h.orderQueue.deferLocalOrder('h1', 11, makeOrder('u1'), false);
        expect(h.controller.shouldTrackHostAnchorWallWait(10, hb({ hostTick: 11, hostPaused: true }))).toBe(false);
    });

    it('returns false when host is not paused', () => {
        const h = makeHarness();
        h.controller.setPreviouslySyncedAtTick(10);
        h.orderQueue.deferLocalOrder('h1', 11, makeOrder('u1'), false);
        expect(h.controller.shouldTrackHostAnchorWallWait(10, hb({ hostTick: 10, hostPaused: false }))).toBe(false);
    });

    it('returns false when host is paused at anchor but nothing is in flight or optimistically ahead', () => {
        const h = makeHarness();
        h.controller.setPreviouslySyncedAtTick(10);
        expect(h.controller.shouldTrackHostAnchorWallWait(10, hb({ hostTick: 10, hostPaused: true }))).toBe(false);
    });

    it('returns true when there is a deferred local order', () => {
        const h = makeHarness();
        h.controller.setPreviouslySyncedAtTick(10);
        h.orderQueue.deferLocalOrder('h1', 11, makeOrder('u1'), false);
        expect(h.controller.shouldTrackHostAnchorWallWait(10, hb({ hostTick: 10, hostPaused: true }))).toBe(true);
    });

    it('returns true when there is an in-flight server-range awaiter', () => {
        const h = makeHarness();
        h.controller.setPreviouslySyncedAtTick(10);
        h.orderQueue.getOurOrdersAwaitingServerRange().add('h_inflight');
        expect(h.controller.shouldTrackHostAnchorWallWait(10, hb({ hostTick: 10, hostPaused: true }))).toBe(true);
    });

    it('returns true when local engine is optimistically ahead of host while paused for parallel batch', () => {
        const h = makeHarness({
            session: { isPausedForOrderSync: () => true },
        });
        h.controller.setPreviouslySyncedAtTick(10);
        expect(h.controller.shouldTrackHostAnchorWallWait(12, hb({ hostTick: 10, hostPaused: true }))).toBe(true);
    });
});

describe('HostAnchorWaitController.refreshHostAnchorWaitAndBlocking', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('emits blocking-host-pause-plane on every call', () => {
        const h = makeHarness();
        h.controller.refreshHostAnchorWaitAndBlocking(0, hb({ hostTick: 0 }));
        expect(h.blockingCallback).toHaveBeenCalledWith({ blocking: false });
    });

    it('clears wall-clock state when not tracking and a stall was previously running', () => {
        const h = makeHarness();
        h.controller.setHostAnchorWaitStartedAtMs(1000);
        h.controller.refreshHostAnchorWaitAndBlocking(0, hb({ hostTick: 0 }));
        expect(h.controller.getHostAnchorWaitStartedAtMs()).toBeNull();
        expect(h.eventCallback).toHaveBeenCalledWith({ phase: 'idle', elapsedMs: 0 });
    });

    it('starts wall-clock and emits idle when stall just began (below show threshold)', () => {
        const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
        const h = makeHarness();
        h.controller.setPreviouslySyncedAtTick(10);
        h.orderQueue.deferLocalOrder('h1', 11, makeOrder('u1'), false);
        h.controller.refreshHostAnchorWaitAndBlocking(10, hb({ hostTick: 10, hostPaused: true }));
        expect(h.controller.getHostAnchorWaitStartedAtMs()).toBe(1000);
        expect(h.eventCallback).toHaveBeenLastCalledWith({ phase: 'idle', elapsedMs: 0 });
        dateSpy.mockRestore();
    });

    it('emits waiting_ui once elapsed reaches the show threshold', () => {
        const dateSpy = vi.spyOn(Date, 'now');
        dateSpy.mockReturnValueOnce(0);
        const h = makeHarness();
        h.controller.setPreviouslySyncedAtTick(10);
        h.orderQueue.deferLocalOrder('h1', 11, makeOrder('u1'), false);
        h.controller.refreshHostAnchorWaitAndBlocking(10, hb({ hostTick: 10, hostPaused: true }));
        dateSpy.mockReturnValue(HOST_ANCHOR_WAIT_SHOW_MS);
        h.controller.refreshHostAnchorWaitAndBlocking(10, hb({ hostTick: 10, hostPaused: true }));
        expect(h.eventCallback).toHaveBeenLastCalledWith({
            phase: 'waiting_ui',
            elapsedMs: HOST_ANCHOR_WAIT_SHOW_MS,
        });
        dateSpy.mockRestore();
    });

    it('triggers requestResync once when elapsed reaches the resync threshold', () => {
        const dateSpy = vi.spyOn(Date, 'now');
        dateSpy.mockReturnValueOnce(0);
        const h = makeHarness();
        h.controller.setPreviouslySyncedAtTick(10);
        h.orderQueue.deferLocalOrder('h1', 11, makeOrder('u1'), false);
        h.controller.refreshHostAnchorWaitAndBlocking(10, hb({ hostTick: 10, hostPaused: true }));
        dateSpy.mockReturnValue(HOST_ANCHOR_RESYNC_MS + 100);
        h.controller.refreshHostAnchorWaitAndBlocking(10, hb({ hostTick: 10, hostPaused: true }));
        expect(h.requestResync).toHaveBeenCalledTimes(1);
        expect(h.requestResync).toHaveBeenCalledWith('host-stuck-after-submit');
        expect(h.controller.getHostAnchorResyncEmittedForCurrentStall()).toBe(true);
        const forcing = h.eventCallback.mock.calls.find(
            (c) => (c[0] as { phase: string }).phase === 'forcing_resync',
        );
        expect(forcing).toBeDefined();
        dateSpy.mockRestore();
    });

    it('does not trigger requestResync more than once for the same stall', () => {
        const dateSpy = vi.spyOn(Date, 'now');
        dateSpy.mockReturnValueOnce(0);
        const h = makeHarness();
        h.controller.setPreviouslySyncedAtTick(10);
        h.orderQueue.deferLocalOrder('h1', 11, makeOrder('u1'), false);
        h.controller.refreshHostAnchorWaitAndBlocking(10, hb({ hostTick: 10, hostPaused: true }));
        dateSpy.mockReturnValue(HOST_ANCHOR_RESYNC_MS + 100);
        h.controller.refreshHostAnchorWaitAndBlocking(10, hb({ hostTick: 10, hostPaused: true }));
        dateSpy.mockReturnValue(HOST_ANCHOR_RESYNC_MS + 500);
        h.controller.refreshHostAnchorWaitAndBlocking(10, hb({ hostTick: 10, hostPaused: true }));
        expect(h.requestResync).toHaveBeenCalledTimes(1);
        dateSpy.mockRestore();
    });

    it('skips requestResync when recovery is already in progress', () => {
        const dateSpy = vi.spyOn(Date, 'now');
        dateSpy.mockReturnValueOnce(0);
        const h = makeHarness({ isRecovering: true });
        h.controller.setPreviouslySyncedAtTick(10);
        h.orderQueue.deferLocalOrder('h1', 11, makeOrder('u1'), false);
        h.controller.refreshHostAnchorWaitAndBlocking(10, hb({ hostTick: 10, hostPaused: true }));
        dateSpy.mockReturnValue(HOST_ANCHOR_RESYNC_MS + 100);
        h.controller.refreshHostAnchorWaitAndBlocking(10, hb({ hostTick: 10, hostPaused: true }));
        expect(h.requestResync).not.toHaveBeenCalled();
        expect(h.controller.getHostAnchorResyncEmittedForCurrentStall()).toBe(false);
        dateSpy.mockRestore();
    });

    it('still fires host-stuck-after-submit when accepted-post at host batch (Fix A not-stuck state)', () => {
        const dateSpy = vi.spyOn(Date, 'now');
        dateSpy.mockReturnValueOnce(0);
        const h = makeHarness({
            session: {
                isPausedForOrderSync: () => true,
                getEngineTick: () => 12,
            },
        });
        h.controller.setPreviouslySyncedAtTick(10);
        h.orderQueue.noteAcceptedOurPostAtTick(11);
        h.controller.refreshHostAnchorWaitAndBlocking(12, hb({ hostTick: 10, hostPaused: true }));
        dateSpy.mockReturnValue(HOST_ANCHOR_RESYNC_MS + 100);
        h.controller.refreshHostAnchorWaitAndBlocking(12, hb({ hostTick: 10, hostPaused: true }));
        expect(h.requestResync).toHaveBeenCalledTimes(1);
        expect(h.requestResync).toHaveBeenCalledWith('host-stuck-after-submit');
        dateSpy.mockRestore();
    });
});
