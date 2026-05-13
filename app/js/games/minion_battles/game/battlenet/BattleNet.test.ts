import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LobbyClient } from '../../../../LobbyClient';
import type { BattleOrder, SerializedGameState } from '../types';
import {
    BattleNet,
    BATTLE_NET_MAX_DEFERRED_ORDERS,
    BATTLE_NET_T2_RESYNC_POLLS,
    HOST_ANCHOR_RESYNC_MS,
    type BattleSessionHandle,
} from './BattleNet';

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
        applyRemoteOrders: () => {},
        isPausedForOrderSync: () => false,
        getWaitingForOrdersBatch: () => null,
        isDebugSimulationFrozen: () => false,
        isEngineSimulationRunning: () => false,
        setMultiplayerAwaitHostCatchup: () => {},
        ...overrides,
    };
}

function makeApi(overrides: Record<string, unknown> = {}): LobbyClient {
    const api = {
        appendLobbyLog: vi.fn(async () => ({ success: true })),
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
        const applyRemoteOrders = vi.fn();
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
            { atTick: 81, order: makeOrder('a') },
            { atTick: 82, order: makeOrder('b') },
        ]);
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

    it('emits synced when ahead of host on early polls (T1 quiet window)', async () => {
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
        expect(status).toHaveBeenCalledWith('synced');
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
        const applyRemoteOrders = vi.fn();
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
        expect(applyRemoteOrders).toHaveBeenNthCalledWith(1, [{ atTick: 2, order: makeOrder('a') }]);
        expect(applyRemoteOrders).toHaveBeenNthCalledWith(2, [{ atTick: 2, order: makeOrder('b') }]);
    });

    it('legacy tip polling does not skip late order at same tick after an empty range response', async () => {
        const applyRemoteOrders = vi.fn();
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
        expect(applyRemoteOrders).toHaveBeenCalledWith([{ atTick: 96, order: makeOrder('late') }]);
    });

    // Recovery flow tests (divergent fingerprints, latest snapshot vs targeted snapshot,
    // initial-state replay fallback) moved to battlenet/RecoveryCoordinator.test.ts.

    it('submitOrder applies local order only once for duplicate submissions', async () => {
        const applyRemoteOrders = vi.fn();
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
        expect((api as unknown as { appendBattleOrder: ReturnType<typeof vi.fn> }).appendBattleOrder).toHaveBeenCalledTimes(1);
    });

    it('defers non-host order POST until heartbeat hostTick catches up', async () => {
        const applyRemoteOrders = vi.fn();
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
            applyRemoteOrders: vi.fn(),
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
        const applyRemoteOrders = vi.fn();
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

    it('persistOrder tick_in_past triggers resync', async () => {
        const appendBattleOrder = vi.fn(async () => ({
            accepted: false,
            idHash: 'dead',
            rejectedReason: 'tick_in_past' as const,
            minAllowedTick: 40,
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
        expect(appendBattleOrder).toHaveBeenCalled();
        expect(resync).toHaveBeenCalledWith('tick-in-past');
        expect(details.mock.calls.some((c) => typeof c[0] === 'string' && c[0].includes('order tick already passed'))).toBe(
            true,
        );
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

    it('requests resync pause-flag-tail-mismatch when ahead of host tail and pause flag disagrees', async () => {
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
        expect(status).toHaveBeenCalledWith('waiting_for_host');
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
        expect(status).toHaveBeenCalledWith('waiting_for_host');
        await net.pollOnce();
        expect(resync).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith('waiting_for_host');
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
        expect(status).toHaveBeenCalledWith('waiting_for_host');
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

    it('waiting_for_host when clamped pause plane: empty expectingFromPlayerIds, fp matches host tail, client runs ahead', async () => {
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
        expect(status).toHaveBeenCalledWith('waiting_for_host');
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
                applyRemoteOrders: vi.fn(),
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

    // HostBattleNet.mergeAppliedOrdersForBatch tests moved to battlenet/SnapshotPersistence.test.ts.
});
