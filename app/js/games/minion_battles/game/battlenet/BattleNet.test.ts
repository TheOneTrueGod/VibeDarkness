import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LobbyClient } from '../../../../LobbyClient';
import {
    flushLobbyLogBatchQueueForTests,
    resetLobbyLogBatchQueueForTests,
} from '../../../../lobbyLogBatchQueue';
import type { BattleOrder, SerializedGameState } from '../types';
import {
    BattleNet,
    BATTLE_NET_MAX_DEFERRED_ORDERS,
    BATTLE_NET_T2_RESYNC_POLLS,
    type BattleSessionHandle,
} from './BattleNet';
import {
    BATTLE_NET_STUCK_PAUSED_HOST_AHEAD_POLLS,
    BATTLE_NET_STUCK_PAUSED_RESYNC_POLLS,
    HOST_ANCHOR_RESYNC_MS,
    RESYNC_REASON_PAUSED_BEHIND_HOST_TAIL,
} from './constants';

function makeOrder(id: string): BattleOrder {
    return {
        unitId: `unit_${id}`,
        abilityId: 'wait',
        targets: [],
    };
}

function makeSession(overrides: Partial<BattleSessionHandle> = {}): BattleSessionHandle {
    return {
        getEngineTick: () => 0,
        getRuntimeFingerprintHex: () => 'aaaaaaaaaaaaaaaa',
        getFingerprintTailPaused: () => false,
        getLatestFingerprint: () => ({ tick: 0, fp: 'aaaaaaaaaaaaaaaa', paused: false }),
        getFingerprintRange: () => [],
        getInitialFingerprint: () => '0011223344556677',
        getSerializedSnapshot: () => ({ gameTick: 0 } as SerializedGameState),
        getSerializedInitialState: () => ({ gameTick: 0 } as SerializedGameState),
        getPayloadForPersistedInitialStateOrNull: () => ({
            state: { gameTick: 0 } as SerializedGameState,
            initialFingerprint: '0011223344556677',
        }),
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
        ...overrides,
    };
}

function makeApi(overrides: Record<string, unknown> = {}): LobbyClient {
    const api = {
        appendLobbyLog: vi.fn(async () => ({ success: true })),
        appendLobbyLogBatch: vi.fn(async () => ({ success: true })),
        appendBattleOrder: vi.fn(async (_lobbyId: string, _gameId: string, body: { idHash?: string }) => ({
            accepted: true,
            idHash: body.idHash ?? 'idhash',
        })),
        getBattleOrdersRange: vi.fn(async () => ({ orders: [] })),
        mergeBattleAppliedOrders: vi.fn(async () => ({ success: true, merged: 0 })),
        getBattleHeartbeat: vi.fn(async () => ({
            hostTick: 0,
            hostFingerprint: 'aaaaaaaaaaaaaaaa',
            hostPaused: false,
            ordersTipTick: 0,
            orderBatchAtTick: null,
            pausedAtTick: null,
            expectingFromPlayerIds: null,
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 0,
        })),
        saveBattleInitialState: vi.fn(async () => {}),
        getBattleInitialState: vi.fn(async () => ({
            state: { gameTick: 0 } as SerializedGameState,
            initialFingerprint: '0011223344556677',
        })),
        saveBattleSnapshot: vi.fn(async () => {}),
        getBattleSnapshot: vi.fn(async () => ({
            tick: 0,
            state: { gameTick: 0 } as SerializedGameState,
            synchash: null,
        })),
        appendBattleFingerprints: vi.fn(async () => ({ appended: 0 })),
        getBattleFingerprintsRange: vi.fn(async () => ({
            records: [],
        })),
        ...overrides,
    };
    return api as unknown as LobbyClient;
}

// The lobby-log batch queue (`lobbyLogBatchQueue.ts`) is module-level state shared across every
// test in the process: leftover unflushed lines from an earlier test (or its lobbyClient mock)
// can be swept up by a later test's size-threshold auto-flush and posted via the wrong mock.
// Reset before every test file-wide so `appendLobbyLogBatch` assertions are test-local.
beforeEach(() => {
    resetLobbyLogBatchQueueForTests();
});

describe('BattleNet', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('pollOnce skips heartbeat GET while debug simulation freeze is active', async () => {
        const getBattleHeartbeat = vi.fn();
        const api = makeApi({ getBattleHeartbeat });
        const net = new BattleNet({
            api,
            session: makeSession({ isDebugSimulationFrozen: () => true }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        await net.pollOnce();
        expect(getBattleHeartbeat).not.toHaveBeenCalled();
    });

    it('pollOnce does not start a second heartbeat while the first is still awaiting HTTP (no overlap)', async () => {
        let releaseFirst: ((hb: Record<string, unknown>) => void) | undefined;
        const firstPending = new Promise<Record<string, unknown>>((resolve) => {
            releaseFirst = resolve;
        });
        const getBattleHeartbeat = vi.fn(() => firstPending);
        const api = makeApi({ getBattleHeartbeat });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 0,
                getLatestFingerprint: () => ({ tick: 0, fp: 'aaaaaaaaaaaaaaaa', paused: false }),
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const p1 = net.pollOnce();
        await net.pollOnce();
        expect(getBattleHeartbeat).toHaveBeenCalledTimes(1);
        releaseFirst!({
            hostTick: 0,
            hostFingerprint: 'aaaaaaaaaaaaaaaa',
            ordersTipTick: 0,
            pausedAtTick: null,
            expectingFromPlayerIds: null,
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 0,
        });
        await p1;
    });

    it('fetches and applies missing orders when engine is behind host', async () => {
        const applyRemoteOrders = vi.fn().mockReturnValue({ newlyAppliedKeys: [], skippedKeys: [] });
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 100,
                hostFingerprint: 'aaaaaaaaaaaaaaaa',
                ordersTipTick: 100,
                orderBatchAtTick: null,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
                heartbeatSeq: 0,
            })),
            getBattleOrdersRange: vi.fn(async () => ({
                orders: [
                    { atTick: 81, playerId: 'p2', idHash: 'h1', order: makeOrder('a') },
                    { atTick: 82, playerId: 'p2', idHash: 'h2', order: makeOrder('b') },
                ],
            })),
        });
        const session = makeSession({
            getEngineTick: () => 80,
            applyRemoteOrders,
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });

        await net.pollOnce();

        expect(applyRemoteOrders).toHaveBeenCalledTimes(1);
        expect(applyRemoteOrders).toHaveBeenCalledWith([
            { atTick: 81, order: makeOrder('a'), idHash: 'h1', playerId: 'p2' },
            { atTick: 82, order: makeOrder('b'), idHash: 'h2', playerId: 'p2' },
        ]);
    });

    it('non-host: includePastApplied latch keeps includePastApplied when cold-start heuristic is false', async () => {
        const hbOpts: Array<{ includePastApplied?: boolean }> = [];
        const api = makeApi({
            getBattleHeartbeat: vi.fn(
                async (_l: string, _g: string, _p: string, opts?: { includePastApplied?: boolean }) => {
                    hbOpts.push({ includePastApplied: opts?.includePastApplied });
                    const behind = engineTick < 50;
                    return {
                        hostTick: 50,
                        hostFingerprint: 'fp50aligned00000',
                        hostPaused: engineTick < 50,
                        ordersTipTick: 0,
                        pausedAtTick: behind ? 43 : null,
                        orderBatchAtTick: behind ? 43 : null,
                        expectingFromPlayerIds: behind ? ['p2'] : null,
                        initialFingerprint: '0011223344556677',
                        heartbeatSeq: 0,
                    };
                },
            ),
        });
        let engineTick = 49;
        let paused = false;
        const session = makeSession({
            getEngineTick: () => engineTick,
            isPausedForOrderSync: () => paused,
            getLatestFingerprint: () =>
                engineTick >= 50
                    ? { tick: 50, fp: 'fp50aligned00000', paused: false }
                    : { tick: 49, fp: 'fp50aligned00000', paused: true },
            getFingerprintRange: () => [],
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        net.heartbeatState.updateLastSeenHeartbeat(49);

        await net.pollOnce();
        expect(hbOpts[0]?.includePastApplied).toBe(false);

        await net.pollOnce();
        expect(hbOpts[1]?.includePastApplied).toBe(true);

        engineTick = 50;
        paused = false;
        await net.pollOnce();
        expect(hbOpts[2]?.includePastApplied).toBe(false);
    });

    it('non-host: paused one tick behind host tail triggers paused-behind-host-tail resync on poll', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 50,
                hostFingerprint: 'fp50aligned00000',
                hostPaused: true,
                ordersTipTick: 50,
                pausedAtTick: 51,
                orderBatchAtTick: 51,
                expectingFromPlayerIds: ['p2'],
                initialFingerprint: '0011223344556677',
                heartbeatSeq: 0,
            })),
            getBattleOrdersRange: vi.fn(async () => ({ orders: [] })),
        });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 49,
                isPausedForOrderSync: () => true,
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');
        await net.pollOnce();
        expect(resync).toHaveBeenCalledWith(RESYNC_REASON_PAUSED_BEHIND_HOST_TAIL);
    });

    it('emits synced when equal tick fingerprints match', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 100,
                hostFingerprint: 'abcdefabcdefabcd',
                ordersTipTick: 100,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
            })),
        });
        const session = makeSession({
            getEngineTick: () => 100,
            getLatestFingerprint: () => ({ tick: 100, fp: 'abcdefabcdefabcd', paused: false }),
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const synced = vi.fn();
        net.on('sync-status', synced);

        await net.pollOnce();

        expect(synced).toHaveBeenCalledWith('synced');
    });

    it('emits synced when paused for orders if serverTick equals clientTick and fingerprints match', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 42,
                hostFingerprint: 'fp42matchfp42match',
                hostPaused: true,
                ordersTipTick: 0,
                orderBatchAtTick: 43,
                pausedAtTick: 43,
                expectingFromPlayerIds: ['p2'],
                initialFingerprint: '0011223344556677',
                heartbeatSeq: 0,
            })),
        });
        const session = makeSession({
            getEngineTick: () => 42,
            getLatestFingerprint: () => ({ tick: 42, fp: 'fp42matchfp42match', paused: true }),
            isPausedForOrderSync: () => true,
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const synced = vi.fn();
        net.on('sync-status', synced);

        await net.pollOnce();

        expect(synced).toHaveBeenCalledWith('synced');
    });

    it('requests resync when engine and host agree on tick but fingerprints differ (same tick)', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 100,
                hostFingerprint: 'ffffffffffffffff',
                ordersTipTick: 100,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
            })),
        });
        const session = makeSession({
            getEngineTick: () => 100,
            getLatestFingerprint: () => ({ tick: 100, fp: '0000000000000000', paused: false }),
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const requestResyncSpy = vi.spyOn(net, 'requestResync');

        await net.pollOnce();

        expect(requestResyncSpy).toHaveBeenCalledWith('hash-mismatch');
    });

    it('emits waiting_for_host when local engine is ahead', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 80,
                hostFingerprint: 'aaaaaaaaaaaaaaaa',
                ordersTipTick: 80,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
            })),
        });
        const session = makeSession({
            getEngineTick: () => 100,
            isPausedForOrderSync: () => true,
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const status = vi.fn();
        net.on('sync-status', status);

        await net.pollOnce();

        expect(status).toHaveBeenCalledWith('waiting_for_host');
    });

    it('requests resync when local engine is ahead but local ring at host tick disagrees with heartbeat (host tick)', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 100,
                hostFingerprint: 'serverfp11111111',
                ordersTipTick: 100,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
            })),
        });
        const session = makeSession({
            getEngineTick: () => 105,
            isPausedForOrderSync: () => false,
            getFingerprintRange: vi.fn((from: number, to: number) => {
                if (from <= 100 && to >= 100) {
                    return [{ tick: 100, fp: 'localfp000000000', paused: false }];
                }
                return [];
            }),
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const requestResyncSpy = vi.spyOn(net, 'requestResync');

        await net.pollOnce();

        expect(requestResyncSpy).toHaveBeenCalledWith('hash-mismatch');
    });

    it('emits optimistic_client_playahead when ahead of host on early polls (T1 quiet window)', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 80,
                hostFingerprint: 'aaaaaaaaaaaaaaaa',
                ordersTipTick: 80,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
            })),
        });
        const session = makeSession({
            getEngineTick: () => 100,
            isPausedForOrderSync: () => false,
            getFingerprintRange: vi.fn((from: number, to: number) => {
                if (from <= 80 && to >= 80) {
                    return [{ tick: 80, fp: 'aaaaaaaaaaaaaaaa', paused: false }];
                }
                return [];
            }),
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const requestResyncSpy = vi.spyOn(net, 'requestResync');
        const status = vi.fn();
        net.on('sync-status', status);

        await net.pollOnce();

        expect(requestResyncSpy).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith('optimistic_client_playahead');
    });

    it('requests ahead-of-host resync after repeated polls ahead with unchanged server heartbeat tail and matching ring', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 80,
                hostFingerprint: 'aaaaaaaaaaaaaaaa',
                ordersTipTick: 80,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
            })),
        });
        const session = makeSession({
            getEngineTick: () => 100,
            isPausedForOrderSync: () => false,
            getFingerprintRange: vi.fn((from: number, to: number) => {
                if (from <= 80 && to >= 80) {
                    return [{ tick: 80, fp: 'aaaaaaaaaaaaaaaa', paused: false }];
                }
                return [];
            }),
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const requestResyncSpy = vi.spyOn(net, 'requestResync');

        for (let i = 0; i <= BATTLE_NET_T2_RESYNC_POLLS; i++) {
            await net.pollOnce();
        }

        expect(requestResyncSpy).toHaveBeenCalledTimes(1);
        expect(requestResyncSpy).toHaveBeenCalledWith('ahead-of-host');
    });

    it('does not emit synced when non-host is order-paused ahead of host tail with matching fingerprint and host not paused', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 100,
                hostFingerprint: 'aaaaaaaaaaaaaaaa',
                hostPaused: false,
                ordersTipTick: 100,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
            })),
        });
        const session = makeSession({
            getEngineTick: () => 105,
            isPausedForOrderSync: () => true,
            getWaitingForOrdersBatch: () => ({
                waiters: [{ unitId: 'u1', ownerId: 'p1' }],
                atTick: 106,
            }),
            getFingerprintRange: vi.fn((from: number, to: number) => {
                if (from <= 100 && to >= 100) {
                    return [{ tick: 100, fp: 'aaaaaaaaaaaaaaaa', paused: false }];
                }
                return [];
            }),
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const status = vi.fn();
        net.on('sync-status', status);

        await net.pollOnce();

        expect(status).toHaveBeenCalledWith('waiting_for_host');
        expect(status).not.toHaveBeenCalledWith('synced');
    });

    it('host sets waiting_for_host when tail fingerprint disagrees with heartbeat at same tick', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 50,
                hostFingerprint: 'server_tail_fp________',
                ordersTipTick: 50,
                pausedAtTick: null,
                hostPaused: false,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
            })),
        });
        const session = makeSession({
            getEngineTick: () => 50,
            getLatestFingerprint: () => ({ tick: 50, fp: 'local_mismatch_fp____', paused: false }),
            getFingerprintRange: (from: number, to: number) =>
                from <= 50 && to >= 50 ? [{ tick: 50, fp: 'local_mismatch_fp____', paused: false }] : [],
        });
        const net = new BattleNet({
            api,
            session,
            isHost: true,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'host',
        });
        const status = vi.fn();
        net.on('sync-status', status);
        await net.pollOnce();
        expect(status).toHaveBeenCalledWith('waiting_for_host');
    });

    it('does not emit waiting_for_host for host clients when local engine is ahead', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 80,
                hostFingerprint: 'aaaaaaaaaaaaaaaa',
                ordersTipTick: 80,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
            })),
        });
        const session = makeSession({
            getEngineTick: () => 100,
        });
        const net = new BattleNet({
            api,
            session,
            isHost: true,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'host',
        });
        const status = vi.fn();
        net.on('sync-status', status);

        await net.pollOnce();

        expect(status).not.toHaveBeenCalledWith('waiting_for_host');
    });

    it('revision fetch pulls a second order when ordersRecordCount increases but ordersTipTick does not', async () => {
        const applyRemoteOrders = vi.fn().mockReturnValue({ newlyAppliedKeys: [], skippedKeys: [] });
        let heartbeatCalls = 0;
        let rangeCalls = 0;
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => {
                heartbeatCalls += 1;
                if (heartbeatCalls === 1) {
                    return {
                        hostTick: 50,
                        hostFingerprint: 'fp50',
                        ordersTipTick: 2,
                        ordersRecordCount: 1,
                        pausedAtTick: null,
                        expectingFromPlayerIds: null,
                        initialFingerprint: '0011223344556677',
                    };
                }
                return {
                    hostTick: 50,
                    hostFingerprint: 'fp50',
                    ordersTipTick: 2,
                    ordersRecordCount: 2,
                    pausedAtTick: null,
                    expectingFromPlayerIds: null,
                    initialFingerprint: '0011223344556677',
                };
            }),
            getBattleOrdersRange: vi.fn(async () => {
                rangeCalls += 1;
                if (rangeCalls === 1) {
                    return {
                        orders: [{ atTick: 2, playerId: '8', idHash: 'h1', order: makeOrder('a') }],
                    };
                }
                return {
                    orders: [
                        { atTick: 2, playerId: '8', idHash: 'h1', order: makeOrder('a') },
                        { atTick: 2, playerId: '9', idHash: 'h2', order: makeOrder('b') },
                    ],
                };
            }),
        });
        const session = makeSession({
            getEngineTick: () => 50,
            getLatestFingerprint: () => ({ tick: 50, fp: 'fp50', paused: false }),
            applyRemoteOrders,
        });
        const net = new BattleNet({
            api,
            session,
            isHost: true,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'host',
        });

        await net.pollOnce();
        await net.pollOnce();

        expect(rangeCalls).toBe(2);
        expect(applyRemoteOrders).toHaveBeenCalledTimes(2);
        expect(applyRemoteOrders).toHaveBeenNthCalledWith(1, [
            { atTick: 2, order: makeOrder('a'), idHash: 'h1', playerId: '8' },
        ]);
        expect(applyRemoteOrders).toHaveBeenNthCalledWith(2, [
            { atTick: 2, order: makeOrder('a'), idHash: 'h1', playerId: '8' },
            { atTick: 2, order: makeOrder('b'), idHash: 'h2', playerId: '9' },
        ]);
    });

    it('legacy tip polling does not skip late order at same tick after an empty range response', async () => {
        const applyRemoteOrders = vi.fn().mockReturnValue({ newlyAppliedKeys: [], skippedKeys: [] });
        let heartbeatCalls = 0;
        let rangeCalls = 0;
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => {
                heartbeatCalls += 1;
                return {
                    hostTick: 100,
                    hostFingerprint: 'fp100',
                    ordersTipTick: 96,
                    orderBatchAtTick: 96,
                    pausedAtTick: 96,
                    expectingFromPlayerIds: ['9'],
                    initialFingerprint: '0011223344556677',
                    heartbeatSeq: 0,
                };
            }),
            getBattleOrdersRange: vi.fn(async () => {
                rangeCalls += 1;
                if (rangeCalls === 1) {
                    return { orders: [] };
                }
                return {
                    orders: [{ atTick: 96, playerId: '9', idHash: 'late96', order: makeOrder('late') }],
                };
            }),
        });
        const session = makeSession({
            getEngineTick: () => 95,
            applyRemoteOrders,
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });

        await net.pollOnce();
        await net.pollOnce();

        expect(heartbeatCalls).toBe(2);
        expect(rangeCalls).toBe(2);
        expect(applyRemoteOrders).toHaveBeenCalledTimes(1);
        expect(applyRemoteOrders).toHaveBeenCalledWith([
            { atTick: 96, order: makeOrder('late'), idHash: 'late96', playerId: '9' },
        ]);
    });

    // Recovery flow tests (divergent fingerprints, latest snapshot vs targeted snapshot,
    // initial-state replay fallback) moved to battlenet/RecoveryCoordinator.test.ts.

    it('submitOrder applies local order only once for duplicate submissions', async () => {
        const applyRemoteOrders = vi.fn().mockReturnValue({ newlyAppliedKeys: [], skippedKeys: [] });
        let heartbeatCalls = 0;
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => {
                heartbeatCalls += 1;
                return {
                    hostTick: heartbeatCalls >= 1 ? 20 : 0,
                    hostFingerprint: 'aaaaaaaaaaaaaaaa',
                    ordersTipTick: 20,
                    pausedAtTick: null,
                    expectingFromPlayerIds: null,
                    initialFingerprint: '0011223344556677',
                };
            }),
        });
        const session = makeSession({
            applyRemoteOrders,
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const order = makeOrder('same');

        await net.submitOrder(order, 20);
        await net.submitOrder(order, 20);
        await net.pollOnce();

        expect(applyRemoteOrders).toHaveBeenCalledTimes(1);
        expect(applyRemoteOrders).toHaveBeenCalledWith([
            expect.objectContaining({ atTick: 20, order, playerId: 'p1' }),
        ]);
        expect((api as unknown as { appendBattleOrder: ReturnType<typeof vi.fn> }).appendBattleOrder).toHaveBeenCalledTimes(1);
    });

    it('submitOrder with skipLocalApply registers dedupe without optimistic local apply', async () => {
        const applyRemoteOrders = vi.fn().mockReturnValue({ newlyAppliedKeys: [], skippedKeys: [] });
        const seedRemoteOrderDedupeKeys = vi.fn();
        const appendBattleOrder = vi.fn(async (_l: string, _g: string, body: { idHash?: string }) => ({
            accepted: true,
            idHash: body.idHash ?? 'idhash',
        }));
        const api = makeApi({
            appendBattleOrder,
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 20,
                hostFingerprint: 'aaaaaaaaaaaaaaaa',
                ordersTipTick: 20,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
            })),
        });
        const session = makeSession({
            applyRemoteOrders,
            seedRemoteOrderDedupeKeys,
            getEngineTick: () => 0,
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const order = makeOrder('inplace');

        await net.submitOrder(order, 1, { skipLocalApply: true });

        expect(applyRemoteOrders).not.toHaveBeenCalled();
        expect(seedRemoteOrderDedupeKeys).toHaveBeenCalledTimes(1);
        expect(appendBattleOrder).toHaveBeenCalledTimes(1);
    });

    it('submitOrder with skipLocalApply defers POST when client is ahead of heartbeat', async () => {
        const applyRemoteOrders = vi.fn().mockReturnValue({ newlyAppliedKeys: [], skippedKeys: [] });
        const seedRemoteOrderDedupeKeys = vi.fn();
        const appendBattleOrder = vi.fn();
        const api = makeApi({
            appendBattleOrder,
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 20,
                hostFingerprint: 'aaaaaaaaaaaaaaaa',
                ordersTipTick: 20,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
            })),
        });
        const session = makeSession({
            applyRemoteOrders,
            seedRemoteOrderDedupeKeys,
            getEngineTick: () => 50,
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const order = makeOrder('ahead-inplace');

        await net.submitOrder(order, 20, { skipLocalApply: true });

        expect(applyRemoteOrders).not.toHaveBeenCalled();
        expect(seedRemoteOrderDedupeKeys).toHaveBeenCalledTimes(1);
        expect(appendBattleOrder).not.toHaveBeenCalled();
    });

    it('isOrderSubmitPathAvailable is false while recovering', () => {
        const net = new BattleNet({
            api: makeApi(),
            session: makeSession(),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        expect(net.isOrderSubmitPathAvailable()).toBe(true);
        vi.spyOn(net, 'isRecovering', 'get').mockReturnValue(true);
        expect(net.isOrderSubmitPathAvailable()).toBe(false);
    });

    it('defers non-host order POST until heartbeat hostTick catches up', async () => {
        const applyRemoteOrders = vi.fn().mockReturnValue({ newlyAppliedKeys: [], skippedKeys: [] });
        let heartbeatCalls = 0;
        const appendBattleOrder = vi.fn(async (_l: string, _g: string, body: { idHash?: string }) => ({
            accepted: true,
            idHash: body.idHash ?? 'idhash',
        }));
        const api = makeApi({
            appendBattleOrder,
            getBattleHeartbeat: vi.fn(async () => {
                heartbeatCalls += 1;
                if (heartbeatCalls === 1) {
                    return {
                        hostTick: 90,
                        hostFingerprint: 'fp90',
                        ordersTipTick: 0,
                        pausedAtTick: null,
                        expectingFromPlayerIds: null,
                        initialFingerprint: '0011223344556677',
                    };
                }
                return {
                    hostTick: 100,
                    hostFingerprint: 'fp100',
                    ordersTipTick: 0,
                    pausedAtTick: null,
                    expectingFromPlayerIds: null,
                    initialFingerprint: '0011223344556677',
                };
            }),
        });
        const session = makeSession({
            getEngineTick: () => 100,
            applyRemoteOrders,
            getLatestFingerprint: () => ({ tick: 100, fp: 'fp100', paused: false }),
            isPausedForOrderSync: () => true,
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const waiting = vi.fn();
        net.on('host-catchup-wait', waiting);

        await net.pollOnce();
        await net.submitOrder(makeOrder('late'), 100);
        expect(appendBattleOrder).toHaveBeenCalledTimes(0);

        await net.pollOnce();

        expect(appendBattleOrder).toHaveBeenCalledTimes(1);
        expect(applyRemoteOrders).toHaveBeenCalledTimes(1);
        expect(waiting).toHaveBeenLastCalledWith({
            blocking: false,
            stuckHeartbeats: 0,
            hostTick: 100,
            targetTick: null,
            queuedCount: 0,
        });
    });

    it('non-host POSTs order for current batch immediately (paused order round, no flush deadlock)', async () => {
        const appendBattleOrder = vi.fn(async (_l: string, _g: string, body: { idHash?: string }) => ({
            accepted: true,
            idHash: body.idHash ?? 'idhash',
        }));
        const api = makeApi({
            appendBattleOrder,
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 1,
                hostFingerprint: 'fp1',
                ordersTipTick: 0,
                orderBatchAtTick: 2,
                pausedAtTick: 2,
                expectingFromPlayerIds: ['p1'],
                initialFingerprint: '0011223344556677',
                heartbeatSeq: 0,
            })),
        });
        const session = makeSession({
            getEngineTick: () => 1,
            /** Must match heartbeat `hostTick`/`hostFingerprint` or poll triggers hash-mismatch recovery. */
            getLatestFingerprint: () => ({ tick: 1, fp: 'fp1', paused: false }),
            applyRemoteOrders: vi.fn().mockReturnValue({ newlyAppliedKeys: [], skippedKeys: [] }),
            isPausedForOrderSync: () => true,
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });

        await net.pollOnce();
        await net.submitOrder(makeOrder('unit-acts'), 2);

        expect(appendBattleOrder).toHaveBeenCalledTimes(1);
    });

    it('drops deferred local orders on full resync', async () => {
        const applyRemoteOrders = vi.fn().mockReturnValue({ newlyAppliedKeys: [], skippedKeys: [] });
        const appendBattleOrder = vi.fn(async (_l: string, _g: string, body: { idHash?: string }) => ({
            accepted: true,
            idHash: body.idHash ?? 'idhash',
        }));
        const api = makeApi({
            appendBattleOrder,
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 90,
                hostFingerprint: 'fp90',
                ordersTipTick: 0,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
            })),
            getBattleFingerprintsRange: vi.fn(async () => ({ records: [] })),
            getBattleSnapshot: vi.fn(async () => ({
                tick: 90,
                state: { gameTick: 90 } as SerializedGameState,
                synchash: null,
            })),
            getBattleOrdersRange: vi.fn(async () => ({ orders: [] })),
        });
        const session = makeSession({
            getEngineTick: () => 100,
            getLatestFingerprint: () => ({ tick: 90, fp: 'fp90', paused: false }),
            applyRemoteOrders,
            loadFromSnapshot: vi.fn(),
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });

        await net.pollOnce();
        await net.submitOrder(makeOrder('late'), 100);
        expect(appendBattleOrder).toHaveBeenCalledTimes(0);

        net.requestResync('hash-mismatch');
        await vi.waitFor(() => {
            expect((session as unknown as { loadFromSnapshot: ReturnType<typeof vi.fn> }).loadFromSnapshot).toHaveBeenCalled();
        });

        await net.pollOnce();
        expect(appendBattleOrder).toHaveBeenCalledTimes(0);
    });

    it('persistOrder tick_in_past triggers resync when host-tail fingerprints disagree', async () => {
        const appendBattleOrder = vi.fn(async () => ({
            accepted: false,
            idHash: 'dead',
            rejectedReason: 'tick_in_past' as const,
            minAllowedTick: 40,
            hostTick: 39,
            hostFingerprint: 'hostfp_mismatch_',
        }));
        const api = makeApi({ appendBattleOrder });
        const net = new BattleNet({
            api,
            session: makeSession({
                getFingerprintRange: (from: number, to: number) =>
                    from <= 39 && to >= 39
                        ? [{ tick: 39, fp: 'local_different_', paused: true }]
                        : [],
            }),
            isHost: true,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'host',
        });
        const resync = vi.spyOn(net, 'requestResync');
        const details = vi.fn();
        net.on('sync-details', details);
        await net.submitOrder(makeOrder('a'), 5);
        expect(appendBattleOrder).toHaveBeenCalled();
        expect(resync).toHaveBeenCalledWith('tick-in-past');
        expect(details.mock.calls.some((c) => typeof c[0] === 'string' && c[0].includes('order tick already passed'))).toBe(
            true,
        );
    });

    it('submitOrder blocks stale atTick without POST (lobby F6E500)', async () => {
        const appendBattleOrder = vi.fn(async () => ({ accepted: true, idHash: 'x' }));
        const getBattleSnapshot = vi.fn(async () => ({
            tick: 97,
            state: { gameTick: 97 } as SerializedGameState,
            synchash: 'hostfp97hostfp97',
        }));
        const api = makeApi({
            appendBattleOrder,
            getBattleSnapshot,
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 97,
                hostFingerprint: 'hostfp97hostfp97',
                hostPaused: true,
                ordersTipTick: 97,
                orderBatchAtTick: 98,
                pausedAtTick: 98,
                expectingFromPlayerIds: ['9'],
                initialFingerprint: '0011223344556677',
                heartbeatSeq: 1,
            })),
        });
        const loadFromSnapshot = vi.fn();
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 96,
                isPausedForOrderSync: () => true,
                loadFromSnapshot,
                getFingerprintRange: (from: number, to: number) =>
                    from <= 97 && to >= 97
                        ? [{ tick: 97, fp: 'hostfp97hostfp97', paused: true }]
                        : [],
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: '1',
        });
        await net.pollOnce();
        const resync = vi.spyOn(net, 'requestResync');
        await net.submitOrder(makeOrder('stale'), 97);
        expect(appendBattleOrder).not.toHaveBeenCalled();
        expect(resync).not.toHaveBeenCalled();
        // Soft align bootstraps from latest checkpoint.
        await vi.waitFor(() => expect(getBattleSnapshot).toHaveBeenCalled());
        expect(loadFromSnapshot).toHaveBeenCalled();
    });

    it('submitOrder blocks when local player is not in expectingFromPlayerIds', async () => {
        const appendBattleOrder = vi.fn(async () => ({ accepted: true, idHash: 'x' }));
        const api = makeApi({
            appendBattleOrder,
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 97,
                hostFingerprint: 'hostfp97hostfp97',
                hostPaused: true,
                ordersTipTick: 97,
                orderBatchAtTick: 98,
                pausedAtTick: 98,
                expectingFromPlayerIds: ['9'],
                initialFingerprint: '0011223344556677',
                heartbeatSeq: 1,
            })),
        });
        const net = new BattleNet({
            api,
            session: makeSession({ getEngineTick: () => 97, isPausedForOrderSync: () => true }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: '1',
        });
        await net.pollOnce();
        // atTick 98 is submittable, but we are not an expected waiter.
        await net.submitOrder(makeOrder('not-expected'), 98);
        expect(appendBattleOrder).not.toHaveBeenCalled();
    });

    it('tick_in_past soft-aligns when host-tail fingerprints agree', async () => {
        // Host path always POSTs (no non-host ahead/stale gates). Server rejects as past while
        // local ring still matches the reported host fingerprint → soft align, not full resync.
        const appendBattleOrder = vi.fn(async () => ({
            accepted: false,
            idHash: 'deadbeef',
            rejectedReason: 'tick_in_past' as const,
            minAllowedTick: 98,
            hostTick: 97,
            hostFingerprint: 'agree_fp_97_____',
        }));
        const getBattleSnapshot = vi.fn(async () => ({
            tick: 97,
            state: { gameTick: 97 } as SerializedGameState,
            synchash: 'agree_fp_97_____',
        }));
        const api = makeApi({ appendBattleOrder, getBattleSnapshot });
        const loadFromSnapshot = vi.fn();
        const net = new BattleNet({
            api,
            session: makeSession({
                loadFromSnapshot,
                getFingerprintRange: (from: number, to: number) =>
                    from <= 97 && to >= 97
                        ? [{ tick: 97, fp: 'agree_fp_97_____', paused: true }]
                        : [],
            }),
            isHost: true,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'host',
        });
        const resync = vi.spyOn(net, 'requestResync');
        await net.submitOrder(makeOrder('race'), 5);
        expect(appendBattleOrder).toHaveBeenCalled();
        await vi.waitFor(() => expect(getBattleSnapshot).toHaveBeenCalled());
        expect(resync).not.toHaveBeenCalled();
        expect(loadFromSnapshot).toHaveBeenCalled();
    });

    it('persistOrder not_unit_owner triggers resync with sync-details (doc: optimistic orders rejected)', async () => {
        const appendBattleOrder = vi.fn(async () => ({
            accepted: false,
            idHash: 'dead',
            rejectedReason: 'not_unit_owner' as const,
        }));
        const api = makeApi({ appendBattleOrder });
        const net = new BattleNet({
            api,
            session: makeSession(),
            isHost: true,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'host',
        });
        const resync = vi.spyOn(net, 'requestResync');
        const details = vi.fn();
        net.on('sync-details', details);
        await net.submitOrder(makeOrder('a'), 5);
        expect(resync).toHaveBeenCalledWith('not-unit-owner');
        expect(details.mock.calls.some((c) => typeof c[0] === 'string' && c[0].includes('do not control this unit'))).toBe(
            true,
        );
    });

    it('persistOrder unknown_unit triggers resync with sync-details', async () => {
        const appendBattleOrder = vi.fn(async () => ({
            accepted: false,
            idHash: 'dead',
            rejectedReason: 'unknown_unit' as const,
        }));
        const api = makeApi({ appendBattleOrder });
        const net = new BattleNet({
            api,
            session: makeSession(),
            isHost: true,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'host',
        });
        const resync = vi.spyOn(net, 'requestResync');
        await net.submitOrder(makeOrder('a'), 5);
        expect(resync).toHaveBeenCalledWith('unknown-unit');
    });

    it('requests resync pause-flag-equal-tick-mismatch when fingerprint matches but pause disagrees (non-host)', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 100,
                hostFingerprint: 'samefingerprint00',
                hostPaused: false,
                ordersTipTick: 100,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
                heartbeatSeq: 0,
            })),
        });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 100,
                getLatestFingerprint: () => ({ tick: 100, fp: 'samefingerprint00', paused: true }),
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');
        await net.pollOnce();
        expect(resync).toHaveBeenCalledWith('pause-flag-equal-tick-mismatch');
    });

    it('requests resync pause-flag-tail-mismatch when local paused at host tick but host is not', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 40,
                hostFingerprint: 'tailfp0000000000',
                hostPaused: false,
                ordersTipTick: 40,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
                heartbeatSeq: 0,
            })),
        });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 55,
                isPausedForOrderSync: () => false,
                getFingerprintRange: (from: number, to: number) =>
                    from <= 40 && to >= 40
                        ? [{ tick: 40, fp: 'tailfp0000000000', paused: true }]
                        : [],
                getLatestFingerprint: () => ({ tick: 55, fp: 'local55', paused: false }),
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');
        await net.pollOnce();
        expect(resync).toHaveBeenCalledWith('pause-flag-tail-mismatch');
    });

    it('does not resync pause-flag-tail-mismatch when client ran through host tick (benign playahead)', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 40,
                hostFingerprint: 'tailfp0000000000',
                hostPaused: true,
                ordersTipTick: 40,
                pausedAtTick: 41,
                orderBatchAtTick: 41,
                expectingFromPlayerIds: ['p1'],
                initialFingerprint: '0011223344556677',
                heartbeatSeq: 0,
            })),
        });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 55,
                isPausedForOrderSync: () => true,
                getFingerprintRange: (from: number, to: number) =>
                    from <= 40 && to >= 40
                        ? [{ tick: 40, fp: 'tailfp0000000000', paused: false }]
                        : [],
                getLatestFingerprint: () => ({ tick: 55, fp: 'local55', paused: true }),
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');
        await net.pollOnce();
        expect(resync).not.toHaveBeenCalled();
    });

    it('waiting_for_host (not pause-plane resync) when host heartbeat paused behind but client sim advanced with parallel waiters', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 50,
                hostFingerprint: 'srv50srv50srv50',
                hostPaused: true,
                ordersTipTick: 50,
                pausedAtTick: 51,
                orderBatchAtTick: 51,
                expectingFromPlayerIds: ['p1', 'p2'],
                initialFingerprint: '0011223344556677',
                heartbeatSeq: 0,
            })),
        });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 60,
                isPausedForOrderSync: () => false,
                getLatestFingerprint: () => ({ tick: 60, fp: 'local60', paused: false }),
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');
        const status = vi.fn();
        net.on('sync-status', status);
        await net.pollOnce();
        expect(resync).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith('optimistic_client_playahead');
    });

    it('optimistic play-ahead: local tick 50 ahead of clamped host; heartbeat advances 5→20 paused — no resync, pause-plane transition re-checks fp', async () => {
        const fp5 = 'fp05bbbbbbbbbbbb';
        const fp20 = 'fp20cccccccccccc';
        const hbAt5Paused = {
            hostTick: 5,
            hostFingerprint: fp5,
            hostPaused: true,
            ordersTipTick: 5,
            orderBatchAtTick: 6,
            pausedAtTick: 6,
            expectingFromPlayerIds: [] as string[],
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 0,
        };
        const hbAt20Paused = {
            hostTick: 20,
            hostFingerprint: fp20,
            hostPaused: true,
            ordersTipTick: 20,
            orderBatchAtTick: 21,
            pausedAtTick: 21,
            expectingFromPlayerIds: [] as string[],
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 1,
        };
        let hbPoll = 0;
        const getBattleHeartbeat = vi.fn(async () => {
            hbPoll += 1;
            return hbPoll === 1 ? hbAt5Paused : hbAt20Paused;
        });
        const getFingerprintRange = vi.fn((from: number, to: number) => {
            if (from <= 5 && to >= 5) {
                return [{ tick: 5, fp: fp5, paused: true }];
            }
            if (from <= 20 && to >= 20) {
                return [{ tick: 20, fp: fp20, paused: true }];
            }
            return [];
        });
        const api = makeApi({ getBattleHeartbeat });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 50,
                isPausedForOrderSync: () => false,
                getFingerprintRange,
                getLatestFingerprint: () => ({ tick: 50, fp: 'local50local50', paused: false }),
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');
        const status = vi.fn();
        const details = vi.fn();
        net.on('sync-status', status);
        net.on('sync-details', details);
        await net.pollOnce();
        expect(resync).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith('optimistic_client_playahead');
        await net.pollOnce();
        expect(resync).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith('optimistic_client_playahead');
        expect(getFingerprintRange).toHaveBeenCalledWith(5, 5);
        expect(getFingerprintRange).toHaveBeenCalledWith(20, 20);
        expect(
            details.mock.calls.some(
                (c) => typeof c[0] === 'string' && c[0].includes('Heartbeat pause plane updated'),
            ),
        ).toBe(true);
    });

    it('pause plane transition: host unpauses — non-host becomes synced when fingerprint matches completed tail', async () => {
        const fp50 = 'srv50aaaaaaaaaaa';
        const hbPaused = {
            hostTick: 50,
            hostFingerprint: fp50,
            hostPaused: true,
            ordersTipTick: 50,
            orderBatchAtTick: 51,
            pausedAtTick: 51,
            expectingFromPlayerIds: ['p1', 'p2'],
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 0,
        };
        const hbRunning = {
            hostTick: 50,
            hostFingerprint: fp50,
            hostPaused: false,
            ordersTipTick: 50,
            orderBatchAtTick: null,
            pausedAtTick: null,
            expectingFromPlayerIds: null as string[] | null,
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 1,
        };
        let hbPoll = 0;
        const getBattleHeartbeat = vi.fn(async () => {
            hbPoll += 1;
            return hbPoll === 1 ? hbPaused : hbRunning;
        });
        const api = makeApi({ getBattleHeartbeat });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 60,
                isPausedForOrderSync: () => false,
                getFingerprintRange: (from: number, to: number) =>
                    from <= 50 && to >= 50 ? [{ tick: 50, fp: fp50, paused: false }] : [],
                getLatestFingerprint: () => ({ tick: 60, fp: 'local60', paused: false }),
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');
        const status = vi.fn();
        net.on('sync-status', status);
        await net.pollOnce();
        expect(resync).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith('optimistic_client_playahead');
        await net.pollOnce();
        expect(resync).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith('synced');
    });

    it('pause plane transition: fingerprint mismatch after pause-plane change triggers resync (still hostPaused)', async () => {
        const fp50 = 'srv50aaaaaaaaaaa';
        const hbPausedOpen = {
            hostTick: 50,
            hostFingerprint: fp50,
            hostPaused: true,
            ordersTipTick: 50,
            orderBatchAtTick: 51,
            pausedAtTick: 51,
            expectingFromPlayerIds: ['p1', 'p2'],
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 0,
        };
        const hbPausedStaleFp = {
            hostTick: 50,
            hostFingerprint: 'mismatch_server_fp',
            hostPaused: true,
            ordersTipTick: 50,
            orderBatchAtTick: 51,
            pausedAtTick: 51,
            expectingFromPlayerIds: [] as string[],
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 1,
        };
        let hbPoll = 0;
        const getBattleHeartbeat = vi.fn(async () => {
            hbPoll += 1;
            return hbPoll === 1 ? hbPausedOpen : hbPausedStaleFp;
        });
        const api = makeApi({ getBattleHeartbeat });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 60,
                isPausedForOrderSync: () => false,
                getFingerprintRange: (from: number, to: number) =>
                    from <= 50 && to >= 50 ? [{ tick: 50, fp: fp50, paused: false }] : [],
                getLatestFingerprint: () => ({ tick: 60, fp: 'local60', paused: false }),
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');
        await net.pollOnce();
        await net.pollOnce();
        expect(resync).toHaveBeenCalledWith('pause-plane-transition-hash-mismatch');
    });

    it('optimistic_client_playahead when clamped pause plane: empty expectingFromPlayerIds, fp matches host tail, client runs ahead', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 1,
                hostFingerprint: 'srv1ffffffffffff',
                hostPaused: true,
                ordersTipTick: 1,
                orderBatchAtTick: 2,
                pausedAtTick: 2,
                expectingFromPlayerIds: [],
                initialFingerprint: '0011223344556677',
                heartbeatSeq: 0,
            })),
        });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 62,
                isPausedForOrderSync: () => false,
                getFingerprintRange: (from: number, to: number) =>
                    from <= 1 && to >= 1 ? [{ tick: 1, fp: 'srv1ffffffffffff', paused: true }] : [],
                getLatestFingerprint: () => ({ tick: 62, fp: 'local62', paused: false }),
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');
        const status = vi.fn();
        net.on('sync-status', status);
        await net.pollOnce();
        expect(resync).not.toHaveBeenCalledWith('pause-plane-host-paused-client-running');
        expect(status).toHaveBeenCalledWith('optimistic_client_playahead');
    });

    it('does not resync behind-host-heartbeat-moved when host tail moves while engine is still behind (allows catch-up)', async () => {
        const fp50 = 'srv50aaaaaaaaaaa';
        const fp55 = 'srv55bbbbbbbbb';
        const hb1 = {
            hostTick: 50,
            hostFingerprint: fp50,
            hostPaused: false,
            ordersTipTick: 50,
            pausedAtTick: null,
            orderBatchAtTick: null,
            expectingFromPlayerIds: null as string[] | null,
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 0,
        };
        const hb2 = {
            ...hb1,
            hostTick: 55,
            hostFingerprint: fp55,
            ordersTipTick: 55,
        };
        const getBattleHeartbeat = vi.fn().mockResolvedValueOnce(hb1).mockResolvedValue(hb2);
        const api = makeApi({ getBattleHeartbeat });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 50,
                getLatestFingerprint: () => ({ tick: 50, fp: fp50, paused: false }),
                getFingerprintRange: () => [],
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');
        await net.pollOnce();
        expect(resync).not.toHaveBeenCalled();
        await net.pollOnce();
        expect(resync).not.toHaveBeenCalledWith('behind-host-heartbeat-moved');
    });

    it('after host tail moves ahead, non-host can catch up and reconcile at equal tick without behind-host resync', async () => {
        const fp50 = 'srv50aaaaaaaaaaa';
        const fp55 = 'srv55bbbbbbbbb';
        const hb1 = {
            hostTick: 50,
            hostFingerprint: fp50,
            hostPaused: false,
            ordersTipTick: 50,
            pausedAtTick: null,
            orderBatchAtTick: null,
            expectingFromPlayerIds: null as string[] | null,
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 0,
        };
        const hb2 = {
            ...hb1,
            hostTick: 55,
            hostFingerprint: fp55,
            ordersTipTick: 55,
        };
        let engineTick = 50;
        const getBattleHeartbeat = vi
            .fn()
            .mockResolvedValueOnce(hb1)
            .mockResolvedValueOnce(hb2)
            .mockResolvedValue(hb2);
        const api = makeApi({ getBattleHeartbeat });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => engineTick,
                getLatestFingerprint: () => ({
                    tick: engineTick,
                    fp: engineTick >= 55 ? fp55 : fp50,
                    paused: false,
                }),
                getFingerprintRange: (from: number, to: number) => {
                    if (from <= 55 && to >= 55 && engineTick >= 55) {
                        return [{ tick: 55, fp: fp55, paused: false }];
                    }
                    if (from <= 50 && to >= 50) {
                        return [{ tick: 50, fp: fp50, paused: false }];
                    }
                    return [];
                },
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');
        const status = vi.fn();
        net.on('sync-status', status);
        await net.pollOnce();
        await net.pollOnce();
        expect(resync).not.toHaveBeenCalledWith('behind-host-heartbeat-moved');
        engineTick = 55;
        await net.pollOnce();
        expect(resync).not.toHaveBeenCalledWith('behind-host-heartbeat-moved');
        expect(status).toHaveBeenCalledWith('synced');
    });

    it('does not resync behind-host when repeated polls keep same hostTick|hostFingerprint while engine is behind', async () => {
        const hb = {
            hostTick: 55,
            hostFingerprint: 'srv55ccccccccc',
            hostPaused: false,
            ordersTipTick: 55,
            pausedAtTick: null,
            expectingFromPlayerIds: null as string[] | null,
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 0,
        };
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => hb),
        });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 50,
                getLatestFingerprint: () => ({ tick: 50, fp: 'local50local50', paused: false }),
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');
        await net.pollOnce();
        await net.pollOnce();
        expect(resync).not.toHaveBeenCalledWith('behind-host-heartbeat-moved');
    });

    it('CDC293: non-host paused for orders while behind host tail triggers full resync on poll', async () => {
        const hostFp = 'cdc293hostfp0000';
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 98,
                hostFingerprint: hostFp,
                hostPaused: true,
                ordersTipTick: 98,
                pausedAtTick: 99,
                orderBatchAtTick: 99,
                expectingFromPlayerIds: ['p1'],
                initialFingerprint: '0011223344556677',
                heartbeatSeq: 1,
            })),
            getBattleOrdersRange: vi.fn(async () => ({ orders: [] })),
        });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 96,
                isPausedForOrderSync: () => true,
                isInteractiveTargetingPreviewActive: () => false,
                getWaitingForOrdersBatch: () => ({
                    atTick: 97,
                    waiters: [
                        { unitId: 'unit_1', ownerId: 'p1' },
                        { unitId: 'unit_2', ownerId: 'p2' },
                    ],
                }),
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p2',
        });
        const resync = vi.spyOn(net, 'requestResync');
        await net.pollOnce();
        expect(resync).toHaveBeenCalledWith(RESYNC_REASON_PAUSED_BEHIND_HOST_TAIL);
    });

    it('host equal-tick storage vs runtime mismatch surfaces waiting_for_host (no client-style hash resync)', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 20,
                hostFingerprint: 'storagetail0000',
                hostPaused: true,
                ordersTipTick: 20,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
                heartbeatSeq: 0,
            })),
        });
        const status = vi.fn();
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 20,
                getLatestFingerprint: () => ({ tick: 20, fp: 'runtimeenginefp0', paused: false }),
            }),
            isHost: true,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'host',
        });
        const resync = vi.spyOn(net, 'requestResync');
        net.on('sync-status', status);
        await net.pollOnce();
        expect(resync).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith('waiting_for_host');
    });

    it('host equal-tick fp match with hostPaused false on tail stays synced when paused for parallel batch (ring paused true)', async () => {
        const fp = 'samehash00000000';
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 20,
                hostFingerprint: fp,
                hostPaused: false,
                ordersTipTick: 20,
                orderBatchAtTick: 21,
                pausedAtTick: 21,
                expectingFromPlayerIds: ['p1', 'p2'],
                initialFingerprint: '0011223344556677',
                heartbeatSeq: 0,
            })),
        });
        const status = vi.fn();
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 20,
                getLatestFingerprint: () => ({ tick: 20, fp, paused: true }),
                isPausedForOrderSync: () => true,
                getWaitingForOrdersBatch: () => ({
                    waiters: [
                        { unitId: 'u1', ownerId: 'p1' },
                        { unitId: 'u2', ownerId: 'p2' },
                    ],
                    atTick: 21,
                }),
            }),
            isHost: true,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'host',
        });
        net.on('sync-status', status);
        await net.pollOnce();
        expect(status).toHaveBeenCalledWith('synced');
    });

    it('requests resync deferred-queue-overflow when deferred POST queue exceeds cap', async () => {
        const recovery = vi
            .spyOn(BattleNet.prototype as unknown as { runDesyncRecovery: (reason: string) => Promise<void> }, 'runDesyncRecovery')
            .mockResolvedValue(undefined);
        const appendBattleOrder = vi.fn();
        const net = new BattleNet({
            api: makeApi({ appendBattleOrder }),
            session: makeSession({
                getEngineTick: () => 0,
                isPausedForOrderSync: () => true,
                applyRemoteOrders: vi.fn().mockReturnValue({ newlyAppliedKeys: [], skippedKeys: [] }),
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');
        try {
            for (let i = 0; i < BATTLE_NET_MAX_DEFERRED_ORDERS; i++) {
                await net.submitOrder(makeOrder(`dq${i}`), 500);
            }
            expect(resync).not.toHaveBeenCalled();
            await net.submitOrder(makeOrder('dq_overflow'), 500);
            expect(resync).toHaveBeenCalledWith('deferred-queue-overflow');
        } finally {
            recovery.mockRestore();
        }
    });

    it('requests resync host-stuck-after-submit when anchor wait exceeds threshold (doc: heartbeat never advances)', async () => {
        let wallMs = 0;
        const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => wallMs);
        const hbPayload = {
            hostTick: 10,
            hostFingerprint: 'anchorfp00000000',
            hostPaused: true,
            ordersTipTick: 10,
            orderBatchAtTick: 11,
            pausedAtTick: 11,
            expectingFromPlayerIds: ['p1'],
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 0,
        };
        const getBattleHeartbeat = vi.fn(async () => hbPayload);
        let engineTick = 10;
        const api = makeApi({ getBattleHeartbeat });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => engineTick,
                getLatestFingerprint: () => ({ tick: engineTick, fp: 'anchorfp00000000', paused: true }),
                isPausedForOrderSync: () => true,
                getFingerprintRange: (from: number, to: number) =>
                    from <= 10 && to >= 10 ? [{ tick: 10, fp: 'anchorfp00000000', paused: true }] : [],
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');
        try {
            await net.pollOnce();
            engineTick = 12;
            wallMs = 0;
            await net.pollOnce();
            wallMs = HOST_ANCHOR_RESYNC_MS + 500;
            await net.pollOnce();
            expect(resync).toHaveBeenCalledWith('host-stuck-after-submit');
        } finally {
            dateSpy.mockRestore();
        }
    });

    it.each(['manual-force-resync', 'user-reload-from-sync-box'] as const)(
        'requestResync(%s) forwards to desync recovery',
        async (reason) => {
            const recovery = vi
                .spyOn(
                    BattleNet.prototype as unknown as { runDesyncRecovery: (r: string) => Promise<void> },
                    'runDesyncRecovery',
                )
                .mockImplementation(async () => {
                    /* noop — avoid real HTTP during recovery */
                });
            const api = makeApi();
            const net = new BattleNet({
                api,
                session: makeSession(),
                isHost: false,
                lobbyId: 'l1',
                gameId: 'g1',
                playerId: 'p1',
            });
            try {
                net.requestResync(reason);
                await vi.waitFor(() => {
                    expect(recovery).toHaveBeenCalledWith(reason);
                });
            } finally {
                recovery.mockRestore();
            }
        },
    );

    it('appendBattleOrder tick_ahead_of_host while paused sets waiting_for_host optimistic playahead details', async () => {
        const appendBattleOrder = vi.fn(async () => ({
            accepted: false,
            idHash: 'aheadhash',
            rejectedReason: 'tick_ahead_of_host' as const,
            maxAllowedTick: 100,
        }));
        const api = makeApi({
            appendBattleOrder,
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 100,
                hostFingerprint: 'hb100hb100hb100',
                hostPaused: true,
                ordersTipTick: 100,
                orderBatchAtTick: 101,
                pausedAtTick: 101,
                expectingFromPlayerIds: ['p1'],
                initialFingerprint: '0011223344556677',
                heartbeatSeq: 0,
            })),
        });
        const status = vi.fn();
        const details = vi.fn();
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 100,
                getLatestFingerprint: () => ({ tick: 100, fp: 'hb100hb100hb100', paused: true }),
                isPausedForOrderSync: () => true,
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        net.on('sync-status', status);
        net.on('sync-details', details);
        await net.pollOnce();
        await net.submitOrder(makeOrder('ahead'), 102);
        expect(appendBattleOrder).toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith('waiting_for_host');
        expect(details.mock.calls.some((c) => typeof c[0] === 'string' && c[0].includes('optimistic playahead'))).toBe(
            true,
        );
    });

    // saveSnapshotOnPause scenarios moved to battlenet/SnapshotPersistence.test.ts.

    it('host pollOnce flushFingerprints forwards paused from queueFingerprint', async () => {
        const appendBattleFingerprints = vi.fn(async () => ({ appended: 1 }));
        const api = makeApi({
            appendBattleFingerprints,
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 0,
                hostFingerprint: 'fp0',
                ordersTipTick: 0,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
            })),
        });
        const net = new BattleNet({
            api,
            session: makeSession(),
            isHost: true,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'host',
        });
        net.queueFingerprint(3, 'deadbeefdeadbeef', true);
        await net.pollOnce();
        expect(appendBattleFingerprints).toHaveBeenCalledWith('l1', 'g1', {
            playerId: 'host',
            records: [{ tick: 3, fp: 'deadbeefdeadbeef', paused: true }],
        });
    });

    it('getOrderSyncSummary reports sending until server range includes the order', async () => {
        let idHashFromAppend = '';
        const appendBattleOrder = vi.fn(async (_l: string, _g: string, body: { idHash?: string }) => {
            idHashFromAppend = body.idHash ?? '';
            return { accepted: true, idHash: idHashFromAppend };
        });
        const order = makeOrder('sync');
        const rangeMock = vi.fn(async () => ({
            orders: [{ atTick: 1, playerId: 'p1', idHash: idHashFromAppend, order }],
        }));
        const api = makeApi({
            appendBattleOrder,
            getBattleOrdersRange: rangeMock,
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 0,
                hostFingerprint: 'aaaaaaaaaaaaaaaa',
                ordersTipTick: 1,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
                heartbeatSeq: 0,
            })),
        });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 0,
                getLatestFingerprint: () => ({ tick: 0, fp: 'aaaaaaaaaaaaaaaa', paused: false }),
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });

        await net.submitOrder(order, 1);
        expect(net.getOrderSyncSummary()).toEqual({ queued: 0, sending: 1 });

        await net.pollOnce();
        expect(net.getOrderSyncSummary()).toEqual({ queued: 0, sending: 0 });
        expect(rangeMock).toHaveBeenCalled();
    });

    it('getOrderSyncSummary reports queued when order is deferred for host tick', async () => {
        const appendBattleOrder = vi.fn();
        const net = new BattleNet({
            api: makeApi({ appendBattleOrder }),
            session: makeSession(),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });

        await net.submitOrder(makeOrder('d'), 3);
        expect(appendBattleOrder).not.toHaveBeenCalled();
        expect(net.getOrderSyncSummary()).toEqual({ queued: 1, sending: 0 });
    });

    it('non-host: optimistic anchor does not resync when host-tail fingerprints still match (benign playahead)', async () => {
        const hbBehind = {
            hostTick: 50,
            hostFingerprint: 'h50h50h50h50h50',
            hostPaused: false,
            ordersTipTick: 50,
            pausedAtTick: null,
            orderBatchAtTick: null,
            expectingFromPlayerIds: null as string[] | null,
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 0,
        };
        const hbAheadPaused = {
            hostTick: 100,
            hostFingerprint: 'h100h100h100h10',
            hostPaused: true,
            ordersTipTick: 100,
            pausedAtTick: 101,
            orderBatchAtTick: 101,
            expectingFromPlayerIds: [] as string[],
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 1,
        };
        let poll = 0;
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => {
                poll += 1;
                return poll === 1 ? hbBehind : hbAheadPaused;
            }),
        });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => (poll === 1 ? 100 : 102),
                isPausedForOrderSync: () => poll >= 2,
                getFingerprintRange: (from: number, to: number) => {
                    if (from <= 50 && to >= 50) {
                        return [{ tick: 50, fp: 'h50h50h50h50h50', paused: false }];
                    }
                    if (from <= 100 && to >= 100) {
                        // Matches host — client is legitimately ahead after submitting last order.
                        return [{ tick: 100, fp: 'h100h100h100h10', paused: true }];
                    }
                    return [];
                },
                getLatestFingerprint: () =>
                    poll === 1
                        ? { tick: 100, fp: 'loc100', paused: false }
                        : { tick: 102, fp: 'loc102', paused: true },
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');
        await net.pollOnce();
        expect(resync).not.toHaveBeenCalled();
        await net.pollOnce();
        expect(resync).not.toHaveBeenCalled();
    });

    it('non-host: optimistic anchor detects divergent pause ticks when host-tail fingerprint mismatches', async () => {
        const hbBehind = {
            hostTick: 50,
            hostFingerprint: 'h50h50h50h50h50',
            hostPaused: false,
            ordersTipTick: 50,
            pausedAtTick: null,
            orderBatchAtTick: null,
            expectingFromPlayerIds: null as string[] | null,
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 0,
        };
        const hbAheadPaused = {
            hostTick: 100,
            hostFingerprint: 'h100h100h100h10',
            hostPaused: true,
            ordersTipTick: 100,
            pausedAtTick: 101,
            orderBatchAtTick: 101,
            expectingFromPlayerIds: [] as string[],
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 1,
        };
        let poll = 0;
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => {
                poll += 1;
                return poll === 1 ? hbBehind : hbAheadPaused;
            }),
        });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => (poll === 1 ? 100 : 102),
                isPausedForOrderSync: () => poll >= 2,
                getFingerprintRange: (from: number, to: number) => {
                    if (from <= 50 && to >= 50) {
                        return [{ tick: 50, fp: 'h50h50h50h50h50', paused: false }];
                    }
                    if (from <= 100 && to >= 100) {
                        return [{ tick: 100, fp: 'DIFFERENT_TAIL_', paused: true }];
                    }
                    return [];
                },
                getLatestFingerprint: () =>
                    poll === 1
                        ? { tick: 100, fp: 'loc100', paused: false }
                        : { tick: 102, fp: 'loc102', paused: true },
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');
        await net.pollOnce();
        expect(resync).not.toHaveBeenCalled();
        await net.pollOnce();
        expect(resync).toHaveBeenCalledWith('optimistic-playback-divergence');
    });

    it('non-host: waiting_for_host + unchanged heartbeat material past stall window forces resync', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
        const stalledHb = {
            hostTick: 100,
            hostFingerprint: 'fpAAAAAAAAAAAA',
            hostPaused: true,
            ordersTipTick: 100,
            pausedAtTick: 101,
            orderBatchAtTick: 101,
            expectingFromPlayerIds: [] as string[],
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 0,
        };
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => stalledHb),
        });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => 105,
                isPausedForOrderSync: () => true,
                getFingerprintRange: (from: number, to: number) =>
                    from <= 100 && to >= 100
                        ? [{ tick: 100, fp: 'fpAAAAAAAAAAAA', paused: true }]
                        : [],
                getLatestFingerprint: () => ({ tick: 105, fp: 'local105', paused: true }),
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');
        await net.pollOnce();
        vi.setSystemTime(new Date('2020-01-01T00:00:20.000Z'));
        await net.pollOnce();
        expect(resync).toHaveBeenCalledWith('waiting-for-host-paused-stall');
        vi.useRealTimers();
    });

    // HostBattleNet.mergeAppliedOrdersForBatch tests moved to battlenet/SnapshotPersistence.test.ts.

    it('non-host: paused behind host tail triggers immediate full resync (replaces stuck-paused escalation path)', async () => {
        let hbPoll = 0;
        const getBattleHeartbeat = vi.fn(async () => {
            const idx = hbPoll;
            hbPoll += 1;
            return {
                hostTick: 100 + idx * 25,
                hostFingerprint: `host_fp_${idx}_________`,
                hostPaused: true,
                ordersTipTick: 100,
                orderBatchAtTick: 101 + idx * 25,
                pausedAtTick: 101 + idx * 25,
                expectingFromPlayerIds: ['p2'] as string[],
                initialFingerprint: '0011223344556677',
                heartbeatSeq: idx,
                ordersRecordCount: 10,
            };
        });
        const getBattleOrdersRange = vi.fn(async () => ({ orders: [] }));
        const api = makeApi({ getBattleHeartbeat, getBattleOrdersRange });
        const session = makeSession({
            getEngineTick: () => 50,
            isPausedForOrderSync: () => true,
            getLatestFingerprint: () => ({ tick: 50, fp: 'local_fp_50_____', paused: true }),
            getFingerprintRange: () => [],
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');

        await net.pollOnce();

        expect(resync).toHaveBeenCalledWith(RESYNC_REASON_PAUSED_BEHIND_HOST_TAIL);
    });

    it('non-host: paused behind host tail resync fires on first poll (no stuck-paused-host-ahead escalation)', async () => {
        let hbPoll = 0;
        const getBattleHeartbeat = vi.fn(async () => {
            const idx = hbPoll;
            hbPoll += 1;
            return {
                hostTick: 100 + idx * 10,
                hostFingerprint: `host_fp_${idx}_________`,
                hostPaused: true,
                ordersTipTick: 100 + idx * 10,
                orderBatchAtTick: 101 + idx * 10,
                pausedAtTick: 101 + idx * 10,
                expectingFromPlayerIds: ['p2'] as string[],
                initialFingerprint: '0011223344556677',
                heartbeatSeq: idx,
                ordersRecordCount: 1 + idx,
            };
        });
        const getBattleOrdersRange = vi.fn(async () => ({ orders: [] }));
        const api = makeApi({ getBattleHeartbeat, getBattleOrdersRange });
        const session = makeSession({
            getEngineTick: () => 50,
            isPausedForOrderSync: () => true,
            getLatestFingerprint: () => ({ tick: 50, fp: 'local_fp_50_____', paused: true }),
            getFingerprintRange: () => [],
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');

        await net.pollOnce();

        expect(resync).toHaveBeenCalledWith(RESYNC_REASON_PAUSED_BEHIND_HOST_TAIL);
        expect(resync).not.toHaveBeenCalledWith('stuck-paused-host-ahead');
    });

    it('non-host: paused-behind-host-tail does not trigger while engine tick keeps pace with host tail', async () => {
        let engineTick = 100;
        let hbPoll = 0;
        const getBattleHeartbeat = vi.fn(async () => {
            const idx = hbPoll;
            hbPoll += 1;
            return {
                hostTick: engineTick,
                hostFingerprint: `host_fp_progress_${idx}__`,
                hostPaused: true,
                ordersTipTick: engineTick,
                orderBatchAtTick: engineTick + 1,
                pausedAtTick: engineTick + 1,
                expectingFromPlayerIds: ['p2'] as string[],
                initialFingerprint: '0011223344556677',
                heartbeatSeq: idx,
                ordersRecordCount: 5 + idx,
            };
        });
        const api = makeApi({ getBattleHeartbeat });
        const session = makeSession({
            getEngineTick: () => engineTick,
            isPausedForOrderSync: () => true,
            getLatestFingerprint: () => ({ tick: engineTick, fp: 'local_progress__', paused: true }),
            getFingerprintRange: () => [],
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');

        for (let i = 0; i < BATTLE_NET_STUCK_PAUSED_HOST_AHEAD_POLLS + BATTLE_NET_STUCK_PAUSED_RESYNC_POLLS + 2; i++) {
            await net.pollOnce();
            engineTick += 5;
        }

        expect(resync).not.toHaveBeenCalledWith(RESYNC_REASON_PAUSED_BEHIND_HOST_TAIL);
        expect(resync).not.toHaveBeenCalledWith('stuck-paused-host-ahead');
    });

    it('non-host: stuck paused detector consumes heartbeat dual-fingerprint echo fields without breaking', async () => {
        const getBattleHeartbeat = vi.fn(async () => ({
            hostTick: 200,
            hostFingerprint: 'authoritative_tail',
            hostPaused: true,
            ordersTipTick: 200,
            orderBatchAtTick: 201,
            pausedAtTick: 201,
            expectingFromPlayerIds: ['p2'] as string[],
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 0,
            ordersRecordCount: 1,
            requestedGameTick: 50,
            requestedGameHash: 'requested_at_50_',
            requestedGamePaused: false,
        }));
        const api = makeApi({ getBattleHeartbeat });
        const session = makeSession({
            getEngineTick: () => 50,
            isPausedForOrderSync: () => true,
            getLatestFingerprint: () => ({ tick: 50, fp: 'requested_at_50_', paused: false }),
            getFingerprintRange: () => [],
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const seenHeartbeats: Array<{ requestedGameTick?: number | null; requestedGameHash?: string | null }> = [];
        net.on('heartbeat', (hb) => {
            seenHeartbeats.push({ requestedGameTick: hb.requestedGameTick, requestedGameHash: hb.requestedGameHash });
        });

        await net.pollOnce();

        expect(seenHeartbeats.length).toBe(1);
        expect(seenHeartbeats[0].requestedGameTick).toBe(50);
        expect(seenHeartbeats[0].requestedGameHash).toBe('requested_at_50_');
    });
});

/** EC110E / lobby 39E984: host paused at batch 2 expecting p1 while local pause plane is ahead. */
const EC110E_HOST_FP = 'ec110e_host_fp____';
const EC110E_HOST_TICK = 1;
const EC110E_HOST_BATCH = 2;
const EC110E_LOCAL_BATCH = 101;
const EC110E_ENGINE_TICK = 100;

function ec110eHeartbeat(overrides: Record<string, unknown> = {}) {
    return {
        hostTick: EC110E_HOST_TICK,
        hostFingerprint: EC110E_HOST_FP,
        hostPaused: true,
        ordersTipTick: EC110E_HOST_TICK,
        orderBatchAtTick: EC110E_HOST_BATCH,
        pausedAtTick: EC110E_HOST_BATCH,
        expectingFromPlayerIds: ['p1'],
        initialFingerprint: '0011223344556677',
        heartbeatSeq: 0,
        ...overrides,
    };
}

function ec110eSession(overrides: Partial<BattleSessionHandle> = {}): BattleSessionHandle {
    return makeSession({
        getEngineTick: () => EC110E_ENGINE_TICK,
        getLatestFingerprint: () => ({ tick: EC110E_ENGINE_TICK, fp: 'ec110e_local____', paused: true }),
        getFingerprintRange: (from: number, to: number) =>
            from <= EC110E_HOST_TICK && to >= EC110E_HOST_TICK
                ? [{ tick: EC110E_HOST_TICK, fp: EC110E_HOST_FP, paused: true }]
                : [],
        isPausedForOrderSync: () => true,
        getWaitingForOrdersBatch: () => ({
            atTick: EC110E_LOCAL_BATCH,
            waiters: [{ unitId: 'u_local', ownerId: 'p1' }],
        }),
        isInteractiveTargetingPreviewActive: () => false,
        ...overrides,
    });
}

describe('BattleNet non-host playahead order submit fixes', () => {
    it('Fix B: defers during recovery then POSTs on poll when recovery ends (rollback caller)', async () => {
        const order = makeOrder('recovery');
        const applyRemoteOrders = vi.fn().mockReturnValue({ newlyAppliedKeys: ['h1'], skippedKeys: [] });
        const appendBattleOrder = vi.fn(async (_l: string, _g: string, body: { idHash?: string }) => ({
            accepted: true,
            idHash: body.idHash ?? 'idhash',
        }));
        const api = makeApi({
            appendBattleOrder,
            getBattleHeartbeat: vi.fn(async () => ec110eHeartbeat()),
        });
        const session = ec110eSession({
            getEngineTick: () => EC110E_HOST_TICK,
            applyRemoteOrders,
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });

        await net.pollOnce();

        const recoveringSpy = vi.spyOn(net, 'isRecovering', 'get').mockReturnValue(true);
        await net.submitOrder(order, EC110E_HOST_BATCH);

        expect(appendBattleOrder).not.toHaveBeenCalled();
        expect(net.getOrderSyncSummary().queued).toBe(1);
        expect(net.hasDeferredOrderFor(order.unitId, EC110E_HOST_BATCH)).toBe(true);

        recoveringSpy.mockReturnValue(false);
        await net.pollOnce();

        expect(appendBattleOrder).toHaveBeenCalledTimes(1);
        expect(appendBattleOrder).toHaveBeenCalledWith(
            'l1',
            'g1',
            expect.objectContaining({ atTick: EC110E_HOST_BATCH }),
        );
        expect(net.getOrderSyncSummary().queued).toBe(0);
        expect(applyRemoteOrders).toHaveBeenCalled();
    });

    it('Fix B: skipLocalApply variant defers during recovery without applyRemoteOrders on flush', async () => {
        const order = makeOrder('recovery_inplace');
        const applyRemoteOrders = vi.fn().mockReturnValue({ newlyAppliedKeys: [], skippedKeys: [] });
        const seedRemoteOrderDedupeKeys = vi.fn();
        const appendBattleOrder = vi.fn(async (_l: string, _g: string, body: { idHash?: string }) => ({
            accepted: true,
            idHash: body.idHash ?? 'idhash',
        }));
        const api = makeApi({
            appendBattleOrder,
            getBattleHeartbeat: vi.fn(async () => ec110eHeartbeat()),
        });
        const session = ec110eSession({
            getEngineTick: () => EC110E_ENGINE_TICK,
            applyRemoteOrders,
            seedRemoteOrderDedupeKeys,
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });

        await net.pollOnce();

        const recoveringSpy = vi.spyOn(net, 'isRecovering', 'get').mockReturnValue(true);
        await net.submitOrder(order, EC110E_HOST_BATCH, { skipLocalApply: true });

        expect(appendBattleOrder).not.toHaveBeenCalled();
        expect(net.getOrderSyncSummary().queued).toBe(1);
        expect(seedRemoteOrderDedupeKeys).toHaveBeenCalledTimes(1);

        recoveringSpy.mockReturnValue(false);
        await net.pollOnce();

        expect(appendBattleOrder).toHaveBeenCalledTimes(1);
        expect(net.getOrderSyncSummary().queued).toBe(0);
        expect(applyRemoteOrders).not.toHaveBeenCalled();
    });

    it('in-place ITS: skipLocalApply at mark batch POSTs immediately when engine is playahead-ahead (04B5B8)', async () => {
        const HOST_TICK = 285;
        const HOST_BATCH = 286;
        const ENGINE_TICK = 311;
        const order = makeOrder('inplace_playahead');
        const appendBattleOrder = vi.fn(async (_l: string, _g: string, body: { idHash?: string }) => ({
            accepted: true,
            idHash: body.idHash ?? 'idhash',
        }));
        const api = makeApi({
            appendBattleOrder,
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: HOST_TICK,
                hostFingerprint: EC110E_HOST_FP,
                hostPaused: true,
                ordersTipTick: HOST_TICK,
                orderBatchAtTick: HOST_BATCH,
                pausedAtTick: HOST_BATCH,
                expectingFromPlayerIds: ['p1'] as string[],
                initialFingerprint: EC110E_HOST_FP,
                heartbeatSeq: 0,
            })),
        });
        const session = ec110eSession({
            getEngineTick: () => ENGINE_TICK,
            isPausedForOrderSync: () => true,
            getWaitingForOrdersBatch: () => ({
                atTick: HOST_BATCH,
                waiters: [{ unitId: 'u_local', ownerId: 'p1' }],
            }),
            isInteractiveTargetingPreviewActive: () => true,
            getFingerprintRange: (from: number, to: number) =>
                from <= HOST_TICK && to >= HOST_TICK
                    ? [{ tick: HOST_TICK, fp: EC110E_HOST_FP, paused: true }]
                    : [],
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });

        await net.pollOnce();
        await net.submitOrder(order, HOST_BATCH, { skipLocalApply: true });

        expect(appendBattleOrder).toHaveBeenCalledTimes(1);
        expect(appendBattleOrder).toHaveBeenCalledWith(
            'l1',
            'g1',
            expect.objectContaining({ atTick: HOST_BATCH }),
        );
        expect(net.getOrderSyncSummary().queued).toBe(0);
        expect(net.hasDeferredOrderFor(order.unitId, HOST_BATCH)).toBe(false);
    });

    it('Fix A guard (i): ITS preview active skips soft-align when host expects us ahead', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ec110eHeartbeat()),
        });
        const session = ec110eSession({
            isInteractiveTargetingPreviewActive: () => true,
        });
        const net = new BattleNet({
            api,
            session,
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const softAlign = vi.spyOn(net, 'softAlignToHostPausePlane');

        await net.pollOnce();

        expect(softAlign).not.toHaveBeenCalled();
    });

    it('Fix A guard (ii): heartbeat pendingOrders finalized endTurn row skips soft-align', async () => {
        const order = makeOrder('pending_row');
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () =>
                ec110eHeartbeat({
                    pendingOrders: [
                        {
                            playerId: 'p1',
                            atTick: EC110E_HOST_BATCH,
                            finalized: true,
                            order: { ...order, endTurn: true },
                        },
                    ],
                }),
            ),
        });
        const net = new BattleNet({
            api,
            session: ec110eSession(),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const softAlign = vi.spyOn(net, 'softAlignToHostPausePlane');

        await net.pollOnce();

        expect(softAlign).not.toHaveBeenCalled();
    });

    it('Fix A guard (iii) / EC110E: in-place mark batch POSTs immediately despite playahead engine tick', async () => {
        const order = makeOrder('ec110e_defer');
        const appendBattleOrder = vi.fn(async (_l: string, _g: string, body: { idHash?: string }) => ({
            accepted: true,
            idHash: body.idHash ?? 'idhash',
        }));
        const getBattleHeartbeat = vi.fn(async () => ec110eHeartbeat());
        const api = makeApi({ appendBattleOrder, getBattleHeartbeat });
        const net = new BattleNet({
            api,
            session: ec110eSession({ isInteractiveTargetingPreviewActive: () => true }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const softAlign = vi.spyOn(net, 'softAlignToHostPausePlane').mockImplementation(() => {});

        await net.pollOnce();
        softAlign.mockRestore();

        await net.submitOrder(order, EC110E_HOST_BATCH, { skipLocalApply: true });

        expect(appendBattleOrder).toHaveBeenCalledTimes(1);
        expect(net.getOrderSyncSummary().queued).toBe(0);

        const softAlignAfterPost = vi.spyOn(net, 'softAlignToHostPausePlane');
        await net.pollOnce();

        expect(softAlignAfterPost).not.toHaveBeenCalled();
        expect(appendBattleOrder).toHaveBeenCalledTimes(1);
    });

    it('genuine-stuck regression (39E984): soft-align fires when no Fix A guards apply', async () => {
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ec110eHeartbeat()),
        });
        const net = new BattleNet({
            api,
            session: ec110eSession(),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const softAlign = vi.spyOn(net, 'softAlignToHostPausePlane');

        await net.pollOnce();

        expect(softAlign).toHaveBeenCalledWith('host-expects-local-player-ahead-batch');
    });

    it('5E0F6B: soft-align fingerprint mismatch at hostTick escalates the align warn to error severity', async () => {
        const appendLobbyLogBatch = vi.fn(async () => ({ success: true }));
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ec110eHeartbeat()),
            appendLobbyLogBatch,
        });
        const net = new BattleNet({
            api,
            // isPausedForOrderSync: false isolates maybeImmediateAlignWhenHostExpectsLocalPlayer's own
            // mismatch handling. With it true (the EC110E default), reconcileNonHostAheadOfHostTail's
            // pre-existing general ahead-of-host-tail hash-mismatch check (same getFingerprintRange
            // comparison) fires first in the same poll and calls requestResync — which synchronously
            // sets isRecovering and makes maybeImmediateAlignWhenHostExpectsLocalPlayer bail before it
            // ever reaches this severity-escalation logic.
            session: ec110eSession({
                isPausedForOrderSync: () => false,
                getFingerprintRange: (from: number, to: number) =>
                    from <= EC110E_HOST_TICK && to >= EC110E_HOST_TICK
                        ? [{ tick: EC110E_HOST_TICK, fp: 'diverged_local_fp', paused: true }]
                        : [],
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const softAlign = vi.spyOn(net, 'softAlignToHostPausePlane').mockImplementation(() => {});

        await net.pollOnce();
        await flushLobbyLogBatchQueueForTests();

        expect(softAlign).toHaveBeenCalledWith('host-expects-local-player-ahead-batch');
        const lines = appendLobbyLogBatch.mock.calls.flatMap(
            (call) =>
                ((call as unknown[])[1] as { lines?: Array<Record<string, unknown>> } | undefined)?.lines ?? [],
        );
        const line = lines.find(
            (l) =>
                l.message ===
                'host expects local player at earlier batch while local pause plane is ahead — soft-aligning',
        );
        expect(line).toBeDefined();
        expect(line?.severity).toBe('error');
        expect(line?.context).toMatchObject({
            localFpAtHostTick: 'diverged_local_fp',
            hostFingerprint: EC110E_HOST_FP,
            fpMatchAtHostTick: false,
        });
    });

    it('genuine-stuck regression (39E984): fingerprint agreement at hostTick keeps the align warn at warn severity', async () => {
        const appendLobbyLogBatch = vi.fn(async () => ({ success: true }));
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => ec110eHeartbeat()),
            appendLobbyLogBatch,
        });
        const net = new BattleNet({
            api,
            session: ec110eSession(),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        vi.spyOn(net, 'softAlignToHostPausePlane').mockImplementation(() => {});

        await net.pollOnce();
        await flushLobbyLogBatchQueueForTests();

        const lines = appendLobbyLogBatch.mock.calls.flatMap(
            (call) =>
                ((call as unknown[])[1] as { lines?: Array<Record<string, unknown>> } | undefined)?.lines ?? [],
        );
        const line = lines.find(
            (l) =>
                l.message ===
                'host expects local player at earlier batch while local pause plane is ahead — soft-aligning',
        );
        expect(line).toBeDefined();
        expect(line?.severity).toBe('warn');
        expect(line?.context).toMatchObject({
            localFpAtHostTick: EC110E_HOST_FP,
            hostFingerprint: EC110E_HOST_FP,
            fpMatchAtHostTick: true,
        });
    });

    it('E2E104 (staged): paused client one tick behind host tail triggers resync instead of staging apply', async () => {
        const E2E_ENGINE_TICK = 696;
        const E2E_LOCAL_BATCH = 697;
        const FAR_ROW_AT = 698;
        const applyRemoteOrders = vi.fn().mockReturnValue({ newlyAppliedKeys: [], skippedKeys: [] });
        let heartbeatCalls = 0;
        const getBattleOrdersRange = vi.fn(async () => ({
            orders: [{ atTick: FAR_ROW_AT, playerId: 'p9', idHash: 'e2e104-staged', order: makeOrder('far') }],
        }));
        const getBattleHeartbeat = vi.fn(async () => {
            heartbeatCalls += 1;
            const hostTick = heartbeatCalls === 1 ? 697 : FAR_ROW_AT;
            return {
                hostTick,
                hostFingerprint: '00a52ba30fd778d0',
                hostPaused: true,
                ordersTipTick: FAR_ROW_AT,
                orderBatchAtTick: FAR_ROW_AT,
                pausedAtTick: FAR_ROW_AT,
                expectingFromPlayerIds: ['p1', 'p9'],
                initialFingerprint: '0011223344556677',
                heartbeatSeq: heartbeatCalls,
            };
        });
        const api = makeApi({ getBattleHeartbeat, getBattleOrdersRange });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => E2E_ENGINE_TICK,
                isPausedForOrderSync: () => true,
                getWaitingForOrdersBatch: () => ({
                    atTick: E2E_LOCAL_BATCH,
                    waiters: [
                        { unitId: 'unit_1', ownerId: 'p1' },
                        { unitId: 'unit_2', ownerId: 'p9' },
                    ],
                }),
                isInteractiveTargetingPreviewActive: () => false,
                applyRemoteOrders,
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });
        const resync = vi.spyOn(net, 'requestResync');

        await net.pollOnce();
        expect(resync).toHaveBeenCalledWith(RESYNC_REASON_PAUSED_BEHIND_HOST_TAIL);
        expect(applyRemoteOrders).not.toHaveBeenCalled();
    });

    it('5E0F6B (staged): paused client behind host tail triggers resync instead of staging apply', async () => {
        const E5E_ENGINE_TICK = 676;
        const E5E_FAR_FUTURE_ORDER_AT = 703;
        const applyRemoteOrders = vi.fn().mockReturnValue({ newlyAppliedKeys: [], skippedKeys: [] });
        let heartbeatCalls = 0;
        const getBattleOrdersRange = vi.fn(async () => ({
            orders: [
                {
                    atTick: E5E_FAR_FUTURE_ORDER_AT,
                    idHash: 'cb27e46b',
                    playerId: '1',
                    order: makeOrder('host'),
                },
            ],
        }));
        const getBattleHeartbeat = vi.fn(async () => {
            heartbeatCalls += 1;
            const hostTick = heartbeatCalls === 1 ? 702 : E5E_FAR_FUTURE_ORDER_AT;
            return {
                hostTick,
                hostFingerprint: 'fcacbc014dd66856',
                hostPaused: true,
                ordersTipTick: E5E_FAR_FUTURE_ORDER_AT,
                orderBatchAtTick: E5E_FAR_FUTURE_ORDER_AT,
                pausedAtTick: E5E_FAR_FUTURE_ORDER_AT,
                expectingFromPlayerIds: ['1', '9'],
                initialFingerprint: '0011223344556677',
                heartbeatSeq: heartbeatCalls,
                ordersRecordCount: 17,
            };
        });
        const api = makeApi({ getBattleHeartbeat, getBattleOrdersRange });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => E5E_ENGINE_TICK,
                isPausedForOrderSync: () => true,
                applyRemoteOrders,
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: '9',
        });
        const resync = vi.spyOn(net, 'requestResync');

        await net.pollOnce();
        expect(resync).toHaveBeenCalledWith(RESYNC_REASON_PAUSED_BEHIND_HOST_TAIL);
        expect(applyRemoteOrders).not.toHaveBeenCalled();
    });
});

/** Step 4: structural-divergence observability — host paused at batch B, local sim never formed a pause there. */
describe('BattleNet: pause plane structural divergence (5E0F6B)', () => {
    const STRUCT_HOST_TICK = 579;
    const STRUCT_HOST_BATCH = 580;
    const STRUCT_ENGINE_TICK = 601;
    const STRUCT_AGREE_FP = 'agree_579_fp____';

    function structuralHeartbeat() {
        return {
            hostTick: STRUCT_HOST_TICK,
            hostFingerprint: STRUCT_AGREE_FP,
            hostPaused: true,
            ordersTipTick: STRUCT_HOST_TICK,
            orderBatchAtTick: STRUCT_HOST_BATCH,
            pausedAtTick: STRUCT_HOST_BATCH,
            expectingFromPlayerIds: [] as string[],
            initialFingerprint: '0011223344556677',
            heartbeatSeq: 0,
        };
    }

    it('host paused at batch B, local sim ran past B with its own pause plane elsewhere, fps agree at hostTick — logs once across repeated polls', async () => {
        const appendLobbyLogBatch = vi.fn(async () => ({ success: true }));
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => structuralHeartbeat()),
            appendLobbyLogBatch,
        });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => STRUCT_ENGINE_TICK,
                isPausedForOrderSync: () => true,
                getWaitingForOrdersBatch: () => ({
                    atTick: 602,
                    waiters: [{ unitId: 'unit_2', ownerId: 'p1' }],
                }),
                getFingerprintRange: (from: number, to: number) =>
                    from <= STRUCT_HOST_TICK && to >= STRUCT_HOST_TICK
                        ? [{ tick: STRUCT_HOST_TICK, fp: STRUCT_AGREE_FP, paused: true }]
                        : [],
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });

        await net.pollOnce();
        await net.pollOnce();
        await flushLobbyLogBatchQueueForTests();

        const lines = appendLobbyLogBatch.mock.calls.flatMap(
            (call) =>
                ((call as unknown[])[1] as { lines?: Array<Record<string, unknown>> } | undefined)?.lines ?? [],
        );
        const divergenceLines = lines.filter(
            (l) => l.message === 'pause plane structural divergence: host paused at batch local sim never formed',
        );
        expect(divergenceLines).toHaveLength(1);
        expect(divergenceLines[0]?.severity).toBe('error');
        expect(divergenceLines[0]?.context).toMatchObject({
            hostTick: STRUCT_HOST_TICK,
            hostBatchAtTick: STRUCT_HOST_BATCH,
            engineTick: STRUCT_ENGINE_TICK,
            localBatchAtTick: 602,
        });
    });

    it('local pause plane equals the host batch — no structural divergence log', async () => {
        const appendLobbyLogBatch = vi.fn(async () => ({ success: true }));
        const api = makeApi({
            getBattleHeartbeat: vi.fn(async () => structuralHeartbeat()),
            appendLobbyLogBatch,
        });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => STRUCT_ENGINE_TICK,
                isPausedForOrderSync: () => true,
                getWaitingForOrdersBatch: () => ({
                    atTick: STRUCT_HOST_BATCH,
                    waiters: [{ unitId: 'unit_2', ownerId: 'p1' }],
                }),
                getFingerprintRange: (from: number, to: number) =>
                    from <= STRUCT_HOST_TICK && to >= STRUCT_HOST_TICK
                        ? [{ tick: STRUCT_HOST_TICK, fp: STRUCT_AGREE_FP, paused: true }]
                        : [],
            }),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p1',
        });

        await net.pollOnce();
        await flushLobbyLogBatchQueueForTests();

        const lines = appendLobbyLogBatch.mock.calls.flatMap(
            (call) =>
                ((call as unknown[])[1] as { lines?: Array<Record<string, unknown>> } | undefined)?.lines ?? [],
        );
        expect(
            lines.some(
                (l) => l.message === 'pause plane structural divergence: host paused at batch local sim never formed',
            ),
        ).toBe(false);
    });
});
