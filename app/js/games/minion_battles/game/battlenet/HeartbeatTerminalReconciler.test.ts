import { describe, it, expect, vi } from 'vitest';
import type { LobbyClient } from '../../../../LobbyClient';
import { flushLobbyLogBatchQueueForTests } from '../../../../lobbyLogBatchQueue';
import { BattleEventBus } from './BattleEventBus';
import {
    BATTLE_NET_T2_RESYNC_POLLS,
    HOST_EQUAL_TICK_FINGERPRINT_MISMATCH_MESSAGE,
    RESYNC_REASON_PAUSED_BEHIND_HOST_TAIL,
    STUCK_PAUSE_PLANE_DESYNC_MESSAGE,
    STUCK_PAUSE_PLANE_LOG_POLLS,
} from './constants';
import type { LocalSyncAnomalyContext } from './types';
import { FingerprintBatcher } from './FingerprintBatcher';
import { HeartbeatHttp } from './HeartbeatHttp';
import { HeartbeatState } from './HeartbeatState';
import { HeartbeatTerminalReconciler } from './HeartbeatTerminalReconciler';
import { SnapshotPersistence } from './SnapshotPersistence';
import { SyncReconciler } from './SyncReconciler';
import { SyncStatusController } from './SyncStatusController';
import type { BattleNetContext } from './BattleNetContext';
import type { BattleApi, BattleNetEventMap, BattleSessionHandle } from './types';
import type { SerializedGameState } from '../types';

type LoggedLobbyLine = { message?: string; severity?: string; context?: Record<string, unknown> };

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

/**
 * `logToLobbyLogBattleSync` casts `ctx.api` to `LobbyClient` at runtime and posts through the batch
 * queue — tests need `appendLobbyLog(Batch)` (not part of the narrower `BattleApi` surface) to
 * inspect logged lines, so the test double's type carries both.
 */
type TestBattleApi = BattleApi & Pick<LobbyClient, 'appendLobbyLog' | 'appendLobbyLogBatch'>;

function makeApi(): TestBattleApi {
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
        appendLobbyLog: vi.fn(async () => undefined) as unknown as LobbyClient['appendLobbyLog'],
        appendLobbyLogBatch: vi.fn(async () => ({ success: true })) as unknown as LobbyClient['appendLobbyLogBatch'],
    };
}

function makeHarness(opts: {
    isHost?: boolean;
    isRecovering?: boolean;
    session?: Partial<BattleSessionHandle>;
} = {}) {
    const events = new BattleEventBus();
    const api = makeApi();
    const session = makeSession(opts.session ?? {});
    const requestResync = vi.fn();
    const notePreviouslySyncedAnchorTick = vi.fn();
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
        requestResync,
        softAlignToHostPausePlane: () => {},
        notePreviouslySyncedAnchorTick,
        resetForDesyncRecoveryEntry: vi.fn(),
    };
    syncReconcilerRef.current = new SyncReconciler(ctx);
    const reconciler = new HeartbeatTerminalReconciler(ctx);
    const syncStatusSpy = vi.fn();
    events.on('sync-status', syncStatusSpy);
    return { ctx, api, reconciler, requestResync, notePreviouslySyncedAnchorTick, syncStatusSpy };
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

describe('HeartbeatTerminalReconciler.reconcileFingerprintsEqualHostTick', () => {
    it('non-host: full match sets synced and records anchor tick', () => {
        const { reconciler, notePreviouslySyncedAnchorTick, syncStatusSpy } = makeHarness({
            session: {
                getLatestFingerprint: () => ({ tick: 5, fp: 'deadbeef', paused: false }),
            },
        });
        reconciler.reconcileFingerprintsEqualHostTick(
            5,
            hb({ hostTick: 5, hostFingerprint: 'deadbeef', hostPaused: false }),
        );
        expect(syncStatusSpy).toHaveBeenLastCalledWith('synced');
        expect(notePreviouslySyncedAnchorTick).toHaveBeenCalledWith(5);
    });

    it('host: runtime fingerprint disagrees with heartbeat tail — waiting_for_host', () => {
        const { reconciler, syncStatusSpy } = makeHarness({
            isHost: true,
            session: {
                getLatestFingerprint: () => ({ tick: 3, fp: 'localonly', paused: false }),
            },
        });
        reconciler.reconcileFingerprintsEqualHostTick(
            3,
            hb({ hostTick: 3, hostFingerprint: 'servertail', hostPaused: false }),
        );
        expect(syncStatusSpy).toHaveBeenLastCalledWith('waiting_for_host');
    });

    async function loggedLines(appendLobbyLogBatch: unknown): Promise<LoggedLobbyLine[]> {
        await flushLobbyLogBatchQueueForTests();
        const mock = appendLobbyLogBatch as { mock: { calls: unknown[][] } };
        return mock.mock.calls.flatMap((call) => {
            const body = call[1] as { lines?: LoggedLobbyLine[] } | undefined;
            return body?.lines ?? [];
        });
    }

    it('host: fingerprint mismatch posts a forced desync lobby line once per episode', async () => {
        const { reconciler, api, requestResync } = makeHarness({
            isHost: true,
            session: {
                getLatestFingerprint: () => ({ tick: 3, fp: 'localonly', paused: false }),
                getLocalSyncAnomalyContext: () => ({
                    engineTick: 3,
                    isPaused: true,
                    storyPauseActive: false,
                    waitingForTargetInputLabel: null,
                    waitingForOrdersAtTick: 4,
                    waiterUnitIds: ['unit_1'],
                    itsPreviewActive: false,
                    pendingOrderCount: 1,
                    pendingOrdersAtOrAfterTick: [
                        { gameTick: 4, unitId: 'unit_1', abilityId: 'wait', endTurn: false },
                    ],
                    runtimeFingerprintHex: 'localonly',
                    fingerprintTailPaused: true,
                }),
            },
        });
        const heartbeat = hb({ hostTick: 3, hostFingerprint: 'servertail', hostPaused: false });
        reconciler.reconcileFingerprintsEqualHostTick(3, heartbeat);
        reconciler.reconcileFingerprintsEqualHostTick(3, heartbeat);
        await Promise.resolve();
        const lines = await loggedLines(api.appendLobbyLogBatch);
        const mismatch = lines.filter((l) => l.message === HOST_EQUAL_TICK_FINGERPRINT_MISMATCH_MESSAGE);
        expect(mismatch).toHaveLength(1);
        expect(mismatch[0]?.severity).toBe('warn');
        expect(mismatch[0]?.context).toMatchObject({
            isHost: true,
            fpMismatch: true,
            localFingerprint: 'localonly',
            hostFingerprint: 'servertail',
            localSync: expect.objectContaining({ waitingForOrdersAtTick: 4, waiterUnitIds: ['unit_1'] }),
        });
        expect(requestResync).not.toHaveBeenCalled();
    });
});

function stuckPauseContext(overrides: Partial<LocalSyncAnomalyContext> = {}): LocalSyncAnomalyContext {
    return {
        engineTick: 1244,
        isPaused: true,
        storyPauseActive: false,
        waitingForTargetInputLabel: null,
        waitingForOrdersAtTick: null,
        waiterUnitIds: [],
        itsPreviewActive: false,
        pendingOrderCount: 1,
        pendingOrdersAtOrAfterTick: [{ gameTick: 1245, unitId: 'unit_1', abilityId: 'wait', endTurn: false }],
        runtimeFingerprintHex: 'deadbeef',
        fingerprintTailPaused: true,
        ...overrides,
    };
}

describe('HeartbeatTerminalReconciler.observeLocalSyncAnomalies', () => {
    async function loggedLines(appendLobbyLogBatch: unknown): Promise<LoggedLobbyLine[]> {
        await flushLobbyLogBatchQueueForTests();
        const mock = appendLobbyLogBatch as { mock: { calls: unknown[][] } };
        return mock.mock.calls.flatMap((call) => {
            const body = call[1] as { lines?: LoggedLobbyLine[] } | undefined;
            return body?.lines ?? [];
        });
    }

    it(`logs stuck pause plane after ${STUCK_PAUSE_PLANE_LOG_POLLS} polls and does not resync`, async () => {
        const { reconciler, api, requestResync } = makeHarness({
            isHost: true,
            session: {
                getLocalSyncAnomalyContext: () => stuckPauseContext(),
            },
        });
        for (let i = 0; i < STUCK_PAUSE_PLANE_LOG_POLLS; i += 1) {
            reconciler.observeLocalSyncAnomalies(1244);
        }
        await Promise.resolve();
        const lines = await loggedLines(api.appendLobbyLogBatch);
        const stuck = lines.filter((l) => l.message === STUCK_PAUSE_PLANE_DESYNC_MESSAGE);
        expect(stuck).toHaveLength(1);
        expect(stuck[0]?.context).toMatchObject({
            source: 'heartbeat_poll',
            isPaused: true,
            waitingForOrdersAtTick: null,
            pendingOrdersAtOrAfterTick: [{ gameTick: 1245, unitId: 'unit_1', abilityId: 'wait', endTurn: false }],
        });
        expect(requestResync).not.toHaveBeenCalled();
    });

    it('does not log a healthy order pause', async () => {
        const { reconciler, api } = makeHarness({
            isHost: true,
            session: {
                getLocalSyncAnomalyContext: () =>
                    stuckPauseContext({ waitingForOrdersAtTick: 1245, waiterUnitIds: ['unit_1'] }),
            },
        });
        for (let i = 0; i < STUCK_PAUSE_PLANE_LOG_POLLS; i += 1) {
            reconciler.observeLocalSyncAnomalies(1244);
        }
        const lines = await loggedLines(api.appendLobbyLogBatch);
        expect(lines.some((l) => l.message === STUCK_PAUSE_PLANE_DESYNC_MESSAGE)).toBe(false);
    });
});

describe('HeartbeatTerminalReconciler.reconcileNonHostAheadOfHostTail', () => {
    it('requests resync on fingerprint mismatch at host tail', () => {
        const { reconciler, requestResync, syncStatusSpy } = makeHarness({
            session: {
                getFingerprintRange: (from: number, to: number) => {
                    if (from === 4 && to === 4) {
                        return [{ tick: 4, fp: 'local', paused: false }];
                    }
                    return [];
                },
            },
        });
        reconciler.reconcileNonHostAheadOfHostTail(6, hb({ hostTick: 4, hostFingerprint: 'remote', hostPaused: false }));
        expect(requestResync).toHaveBeenCalledWith('hash-mismatch');
        expect(syncStatusSpy).not.toHaveBeenCalledWith('synced');
    });

    it(`after enough unchanged tail polls (streak reaches ${BATTLE_NET_T2_RESYNC_POLLS}), requests ahead-of-host resync`, () => {
        const { reconciler, requestResync } = makeHarness({
            session: {
                isPausedForOrderSync: () => false,
                getFingerprintRange: (from: number, to: number) => {
                    if (from === 5 && to === 5) {
                        return [{ tick: 5, fp: 'samefp', paused: false }];
                    }
                    return [];
                },
            },
        });
        const heartbeat = hb({ hostTick: 5, hostFingerprint: 'samefp', hostPaused: false });
        // First poll seeds tail key; streak increments from the second poll onward.
        for (let i = 0; i < BATTLE_NET_T2_RESYNC_POLLS + 1; i += 1) {
            reconciler.reconcileNonHostAheadOfHostTail(7, heartbeat);
        }
        expect(requestResync).toHaveBeenCalledWith('ahead-of-host');
    });
});

/** Step 4: playahead divergence observability — fingerprint-compare before settling `optimistic_client_playahead`. */
describe('HeartbeatTerminalReconciler.reconcileNonHostAheadOfHostTail: playahead fingerprint divergence observability', () => {
    async function loggedLines(appendLobbyLogBatch: unknown): Promise<LoggedLobbyLine[]> {
        await flushLobbyLogBatchQueueForTests();
        const mock = appendLobbyLogBatch as { mock: { calls: unknown[][] } };
        return mock.mock.calls.flatMap((call) => {
            const body = call[1] as { lines?: LoggedLobbyLine[] } | undefined;
            return body?.lines ?? [];
        });
    }

    it('parallelClear + fingerprint mismatch: logs divergence at error severity with the exact context shape', async () => {
        const { reconciler, api, syncStatusSpy } = makeHarness({
            session: {
                getFingerprintRange: (from: number, to: number) =>
                    from === 4 && to === 4 ? [{ tick: 4, fp: 'local_mismatch', paused: true }] : [],
                getWaitingForOrdersBatch: () => ({ atTick: 10, waiters: [] }),
            },
        });

        reconciler.reconcileNonHostAheadOfHostTail(
            6,
            hb({ hostTick: 4, hostFingerprint: 'host_fp_value', hostPaused: true, expectingFromPlayerIds: [] }),
        );

        const lines = await loggedLines(api.appendLobbyLogBatch);
        const divergence = lines.find((l) => l.message === 'playahead fingerprint divergence at host tail');
        expect(divergence).toBeDefined();
        expect(divergence?.severity).toBe('error');
        expect(divergence?.context).toMatchObject({
            hostTick: 4,
            localFp: 'local_mismatch',
            hostFp: 'host_fp_value',
            localBatchAtTick: 10,
            engineTick: 6,
        });
        // Observability only — must not escalate itself; the branch still settles on its normal status.
        expect(syncStatusSpy).toHaveBeenLastCalledWith('optimistic_client_playahead');
    });

    it('parallelOpen (other player still expected) + fingerprint mismatch: also logs divergence (branch previously skipped this case)', async () => {
        const { reconciler, api } = makeHarness({
            session: {
                getFingerprintRange: (from: number, to: number) =>
                    from === 4 && to === 4 ? [{ tick: 4, fp: 'local_mismatch', paused: true }] : [],
            },
        });

        reconciler.reconcileNonHostAheadOfHostTail(
            6,
            hb({ hostTick: 4, hostFingerprint: 'host_fp_value', hostPaused: true, expectingFromPlayerIds: ['p9'] }),
        );

        const lines = await loggedLines(api.appendLobbyLogBatch);
        const divergence = lines.find((l) => l.message === 'playahead fingerprint divergence at host tail');
        expect(divergence).toBeDefined();
        expect(divergence?.severity).toBe('error');
    });

    it('fingerprints agree at host tail: does not log divergence', async () => {
        const { reconciler, api } = makeHarness({
            session: {
                getFingerprintRange: (from: number, to: number) =>
                    from === 4 && to === 4 ? [{ tick: 4, fp: 'agree_fp', paused: true }] : [],
            },
        });

        reconciler.reconcileNonHostAheadOfHostTail(
            6,
            hb({ hostTick: 4, hostFingerprint: 'agree_fp', hostPaused: true, expectingFromPlayerIds: [] }),
        );

        const lines = await loggedLines(api.appendLobbyLogBatch);
        expect(lines.some((l) => l.message === 'playahead fingerprint divergence at host tail')).toBe(false);
    });
});

describe('HeartbeatTerminalReconciler.reconcileNonHostBehindHostTail', () => {
    it('paused for orders while behind host tail forces full resync (CDC293)', () => {
        const { reconciler, requestResync } = makeHarness({
            session: {
                isPausedForOrderSync: () => true,
                isInteractiveTargetingPreviewActive: () => false,
            },
        });

        reconciler.reconcileNonHostBehindHostTail(
            96,
            hb({ hostTick: 98, hostFingerprint: 'hostfp00000000', hostPaused: true }),
            false,
        );

        expect(requestResync).toHaveBeenCalledWith(RESYNC_REASON_PAUSED_BEHIND_HOST_TAIL);
    });

    it('behind host tail while simulating forward (not paused) allows catch-up without resync', () => {
        const { reconciler, requestResync } = makeHarness({
            session: {
                isPausedForOrderSync: () => false,
            },
        });

        reconciler.reconcileNonHostBehindHostTail(
            50,
            hb({ hostTick: 55, hostFingerprint: 'hostfp00000000', hostPaused: false }),
            true,
        );

        expect(requestResync).not.toHaveBeenCalled();
    });

    it('no resync while ITS preview is active even if paused flag is set', () => {
        const { reconciler, requestResync } = makeHarness({
            session: {
                isPausedForOrderSync: () => true,
                isInteractiveTargetingPreviewActive: () => true,
            },
        });

        reconciler.reconcileNonHostBehindHostTail(
            96,
            hb({ hostTick: 98, hostFingerprint: 'hostfp00000000', hostPaused: true }),
            true,
        );

        expect(requestResync).not.toHaveBeenCalled();
    });
});

describe('HeartbeatTerminalReconciler.reconcileNonHostPausePlaneTransition', () => {
    it('aligned at new tail when host unpaused and engine caught up — synced', () => {
        const { reconciler, notePreviouslySyncedAnchorTick, syncStatusSpy } = makeHarness({
            session: {
                getFingerprintRange: (from: number, to: number) => {
                    if (from === 8 && to === 8) {
                        return [{ tick: 8, fp: 'ok', paused: false }];
                    }
                    return [];
                },
            },
        });
        const prev = {
            hostPaused: true,
            hostTick: 7,
            hostFingerprint: 'old',
            orderBatchAtTick: 8 as number | null,
            expectingFromPlayerIds: ['a'] as string[] | null,
        };
        reconciler.reconcileNonHostPausePlaneTransition(
            prev,
            hb({ hostTick: 8, hostFingerprint: 'ok', hostPaused: false }),
            8,
        );
        expect(syncStatusSpy).toHaveBeenLastCalledWith('synced');
        expect(notePreviouslySyncedAnchorTick).toHaveBeenCalledWith(8);
    });

    it('no-op while ctx.isRecovering', () => {
        const { reconciler, syncStatusSpy, requestResync } = makeHarness({ isRecovering: true });
        reconciler.reconcileNonHostPausePlaneTransition(
            {
                hostPaused: false,
                hostTick: 0,
                hostFingerprint: 'a',
                orderBatchAtTick: null,
                expectingFromPlayerIds: null,
            },
            hb({ hostTick: 1, hostFingerprint: 'b', hostPaused: true }),
            1,
        );
        expect(requestResync).not.toHaveBeenCalled();
        expect(syncStatusSpy).not.toHaveBeenCalled();
    });
});
