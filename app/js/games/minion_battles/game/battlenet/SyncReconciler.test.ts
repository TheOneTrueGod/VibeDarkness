import { describe, it, expect, vi } from 'vitest';
import { BattleEventBus } from './BattleEventBus';
import { FingerprintBatcher } from './FingerprintBatcher';
import { HeartbeatHttp } from './HeartbeatHttp';
import { HeartbeatState } from './HeartbeatState';
import { SnapshotPersistence } from './SnapshotPersistence';
import { SyncReconciler } from './SyncReconciler';
import { SyncStatusController } from './SyncStatusController';
import type { BattleNetContext } from './BattleNetContext';
import type { BattleApi, BattleNetEventMap, BattleSessionHandle, NonHostHbPausePlaneSnap } from './types';
import type { SerializedGameState, WaitingForOrders } from '../types';

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
        setMultiplayerAwaitHostCatchup: () => {},
        ...overrides,
    };
}

function makeApi(): BattleApi {
    return {
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
}

function makeCtx(args: { isHost?: boolean; session?: Partial<BattleSessionHandle> } = {}): BattleNetContext {
    const events = new BattleEventBus();
    const api = makeApi();
    const session = makeSession(args.session ?? {});
    const syncReconcilerRef: { current?: SyncReconciler } = {};
    const ctx: BattleNetContext = {
        api,
        session,
        isHost: args.isHost ?? false,
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
            isHost: args.isHost ?? false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        }),
        snapshotPersistence: new SnapshotPersistence({
            api,
            session,
            isHost: args.isHost ?? false,
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
    return ctx;
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

describe('SyncReconciler.resetNonHostAheadStreak', () => {
    it('clears last poll tail key and ahead streak', () => {
        const r = new SyncReconciler(makeCtx());
        r.setLastPollServerTailKey('5|fp');
        r.setAheadWithUnchangedServerTailStreak(3);
        r.resetNonHostAheadStreak();
        expect(r.getLastPollServerTailKey()).toBeNull();
        expect(r.getAheadWithUnchangedServerTailStreak()).toBe(0);
    });
});

describe('SyncReconciler.emitBlockingHostPausePlane', () => {
    it('emits blocking-host-pause-plane with the given blocking flag', () => {
        const ctx = makeCtx();
        const cb = vi.fn();
        ctx.events.on('blocking-host-pause-plane', cb);
        new SyncReconciler(ctx).emitBlockingHostPausePlane(true);
        expect(cb).toHaveBeenCalledWith({ blocking: true });
    });
});

describe('SyncReconciler.snapshotHbPausePlane / pausePlaneKey', () => {
    it('captures hostPaused/hostTick/hostFingerprint/orderBatchAtTick and sorts expectingFromPlayerIds', () => {
        const r = new SyncReconciler(makeCtx());
        const snap = r.snapshotHbPausePlane(
            hb({
                hostPaused: true,
                hostTick: 17,
                hostFingerprint: 'fp17',
                orderBatchAtTick: 18,
                expectingFromPlayerIds: ['z', 'a'],
            }),
        );
        expect(snap).toEqual({
            hostPaused: true,
            hostTick: 17,
            hostFingerprint: 'fp17',
            orderBatchAtTick: 18,
            expectingFromPlayerIds: ['a', 'z'],
        });
    });

    it('falls back to pausedAtTick when orderBatchAtTick is missing', () => {
        const r = new SyncReconciler(makeCtx());
        const snap = r.snapshotHbPausePlane(hb({ orderBatchAtTick: undefined, pausedAtTick: 9 }));
        expect(snap.orderBatchAtTick).toBe(9);
    });

    it('pausePlaneKey is identical for the same logical plane', () => {
        const r = new SyncReconciler(makeCtx());
        const a = hb({ hostPaused: true, hostTick: 5, hostFingerprint: 'fp', orderBatchAtTick: 6, expectingFromPlayerIds: ['a', 'b'] });
        const b = hb({ hostPaused: true, hostTick: 5, hostFingerprint: 'fp', orderBatchAtTick: 6, expectingFromPlayerIds: ['b', 'a'] });
        expect(r.pausePlaneKeyFromHb(a)).toBe(r.pausePlaneKeyFromHb(b));
    });

    it('pausePlaneKey differs when any field changes', () => {
        const r = new SyncReconciler(makeCtx());
        const base: NonHostHbPausePlaneSnap = {
            hostPaused: false,
            hostTick: 5,
            hostFingerprint: 'fp',
            orderBatchAtTick: 6,
            expectingFromPlayerIds: ['a'],
        };
        const key = r.pausePlaneKeyFromSnap(base);
        expect(r.pausePlaneKeyFromSnap({ ...base, hostPaused: true })).not.toBe(key);
        expect(r.pausePlaneKeyFromSnap({ ...base, hostTick: 6 })).not.toBe(key);
        expect(r.pausePlaneKeyFromSnap({ ...base, hostFingerprint: 'other' })).not.toBe(key);
        expect(r.pausePlaneKeyFromSnap({ ...base, orderBatchAtTick: 99 })).not.toBe(key);
    });
});

describe('SyncReconciler.computeBlockingNonHostPausePlane', () => {
    function batchAt(atTick: number): WaitingForOrders {
        return { atTick, waiters: [] };
    }

    it('returns false when local engine has no parallel batch', () => {
        const ctx = makeCtx({ session: { getWaitingForOrdersBatch: () => null } });
        const r = new SyncReconciler(ctx);
        expect(r.computeBlockingNonHostPausePlane(10, hb({ hostTick: 5 }))).toBe(false);
    });

    it('returns true when host parallel batch is at a different tick than local batch', () => {
        const ctx = makeCtx({ session: { getWaitingForOrdersBatch: () => batchAt(5) } });
        const r = new SyncReconciler(ctx);
        expect(r.computeBlockingNonHostPausePlane(5, hb({ hostTick: 4, orderBatchAtTick: 6 }))).toBe(true);
    });

    it('returns true when engine tick is ahead of host tick (even with matching parallel batches)', () => {
        const ctx = makeCtx({ session: { getWaitingForOrdersBatch: () => batchAt(5) } });
        const r = new SyncReconciler(ctx);
        expect(r.computeBlockingNonHostPausePlane(10, hb({ hostTick: 5, orderBatchAtTick: 5 }))).toBe(true);
        expect(r.computeBlockingNonHostPausePlane(10, hb({ hostTick: 5 }))).toBe(true);
        expect(r.computeBlockingNonHostPausePlane(5, hb({ hostTick: 5, orderBatchAtTick: 5 }))).toBe(false);
    });
});

describe('SyncReconciler.hostPauseFlagMismatchBenignForParallelBatch', () => {
    function batchAt(atTick: number): WaitingForOrders {
        return { atTick, waiters: [] };
    }
    const local = { tick: 5, fp: 'fp', paused: true };

    it('returns false for non-host', () => {
        const r = new SyncReconciler(makeCtx({ isHost: false }));
        expect(
            r.hostPauseFlagMismatchBenignForParallelBatch(5, hb({ hostPaused: false }), local),
        ).toBe(false);
    });

    it('returns false when paused flags agree', () => {
        const r = new SyncReconciler(makeCtx({ isHost: true }));
        expect(
            r.hostPauseFlagMismatchBenignForParallelBatch(5, hb({ hostPaused: true }), local),
        ).toBe(false);
    });

    it('returns true for the benign local-paused-only mid-batch case', () => {
        const ctx = makeCtx({
            isHost: true,
            session: {
                isPausedForOrderSync: () => true,
                getWaitingForOrdersBatch: () => batchAt(6),
            },
        });
        const r = new SyncReconciler(ctx);
        expect(
            r.hostPauseFlagMismatchBenignForParallelBatch(5, hb({ hostPaused: false, orderBatchAtTick: 6 }), local),
        ).toBe(true);
    });

    it('returns false when engine tick does not satisfy `engineTick + 1 === batch.atTick`', () => {
        const ctx = makeCtx({
            isHost: true,
            session: {
                isPausedForOrderSync: () => true,
                getWaitingForOrdersBatch: () => batchAt(10),
            },
        });
        const r = new SyncReconciler(ctx);
        expect(
            r.hostPauseFlagMismatchBenignForParallelBatch(5, hb({ hostPaused: false, orderBatchAtTick: 10 }), local),
        ).toBe(false);
    });
});

describe('SyncReconciler.isFingerprintAlignedWithHeartbeat', () => {
    it('returns false when local fingerprint is null', () => {
        const r = new SyncReconciler(makeCtx());
        expect(r.isFingerprintAlignedWithHeartbeat({ hostTick: 5, hostFingerprint: 'fp' })).toBe(false);
    });

    it('returns true when ticks and fingerprints match and paused flag agrees (or is omitted)', () => {
        const ctx = makeCtx({
            session: { getLatestFingerprint: () => ({ tick: 5, fp: 'fp', paused: false }) },
        });
        const r = new SyncReconciler(ctx);
        expect(r.isFingerprintAlignedWithHeartbeat({ hostTick: 5, hostFingerprint: 'fp' })).toBe(true);
        expect(
            r.isFingerprintAlignedWithHeartbeat({ hostTick: 5, hostFingerprint: 'fp', hostPaused: false }),
        ).toBe(true);
    });

    it('returns false when ticks or fingerprints differ, or paused flag mismatches', () => {
        const ctx = makeCtx({
            session: { getLatestFingerprint: () => ({ tick: 5, fp: 'fp', paused: false }) },
        });
        const r = new SyncReconciler(ctx);
        expect(r.isFingerprintAlignedWithHeartbeat({ hostTick: 6, hostFingerprint: 'fp' })).toBe(false);
        expect(r.isFingerprintAlignedWithHeartbeat({ hostTick: 5, hostFingerprint: 'other' })).toBe(false);
        expect(
            r.isFingerprintAlignedWithHeartbeat({ hostTick: 5, hostFingerprint: 'fp', hostPaused: true }),
        ).toBe(false);
    });

    it('returns true when client is ahead of host but fingerprint history matches at host tick', () => {
        // Client replayed orders past a paused host: local tick 1661, host committed tick 1657.
        const ctx = makeCtx({
            session: {
                getLatestFingerprint: () => ({ tick: 1661, fp: 'fp1661', paused: false }),
                getFingerprintRange: (from: number, to: number) =>
                    from === 1657 && to === 1657 ? [{ tick: 1657, fp: 'fp1657', paused: true }] : [],
            },
        });
        const r = new SyncReconciler(ctx);
        expect(
            r.isFingerprintAlignedWithHeartbeat({ hostTick: 1657, hostFingerprint: 'fp1657', hostPaused: true }),
        ).toBe(true);
    });

    it('returns false when client is ahead of host and fingerprint history has no record at host tick', () => {
        const ctx = makeCtx({
            session: {
                getLatestFingerprint: () => ({ tick: 1661, fp: 'fp1661', paused: false }),
                getFingerprintRange: () => [],
            },
        });
        const r = new SyncReconciler(ctx);
        expect(r.isFingerprintAlignedWithHeartbeat({ hostTick: 1657, hostFingerprint: 'fp1657' })).toBe(false);
    });
});
