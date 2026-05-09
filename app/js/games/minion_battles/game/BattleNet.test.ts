import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LobbyClient } from '../../../LobbyClient';
import type { BattleOrder, SerializedGameState } from './types';
import { BattleNet, BATTLE_NET_T2_RESYNC_POLLS, type BattleSessionHandle } from './BattleNet';

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
        getLatestFingerprint: () => ({ tick: 0, fp: 'aaaaaaaaaaaaaaaa' }),
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
        getBattleHeartbeat: vi.fn(async () => ({
            hostTick: 0,
            hostFingerprint: 'aaaaaaaaaaaaaaaa',
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
            getLatestFingerprint: () => ({ tick: 100, fp: 'abcdefabcdefabcd' }),
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
            getLatestFingerprint: () => ({ tick: 42, fp: 'fp42matchfp42match' }),
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
            getLatestFingerprint: () => ({ tick: 100, fp: '0000000000000000' }),
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
                    return [{ tick: 100, fp: 'localfp000000000' }];
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
                    return [{ tick: 80, fp: 'aaaaaaaaaaaaaaaa' }];
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
                    return [{ tick: 80, fp: 'aaaaaaaaaaaaaaaa' }];
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
            getLatestFingerprint: () => ({ tick: 50, fp: 'fp50' }),
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

    it('recovers divergent fingerprints using snapshot and order replay', async () => {
        const loadFromSnapshot = vi.fn();
        const applyRemoteOrders = vi.fn();
        const api = makeApi({
            getBattleFingerprintsRange: vi.fn(async () => ({
                records: [
                    { tick: 50, fp: 'host50' },
                    { tick: 100, fp: 'host100' },
                ],
            })),
            getBattleSnapshot: vi.fn(async (_lobbyId: string, _gameId: string, params: { atTick?: number }) => ({
                tick: params.atTick ?? 49,
                state: { gameTick: params.atTick ?? 49 } as SerializedGameState,
            })),
            getBattleOrdersRange: vi.fn(async () => ({
                orders: [{ atTick: 50, playerId: 'p2', idHash: 'o1', order: makeOrder('r1') }],
            })),
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 100,
                hostFingerprint: 'host100',
                ordersTipTick: 100,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
            })),
        });
        const session = makeSession({
            getEngineTick: () => 100,
            getFingerprintRange: () => [
                { tick: 50, fp: 'local50' },
                { tick: 100, fp: 'local100' },
            ],
            getLatestFingerprint: () => ({ tick: 100, fp: 'host100' }),
            loadFromSnapshot,
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

        await net.requestResync('hash-mismatch');
        await vi.waitFor(() => {
            expect(loadFromSnapshot).toHaveBeenCalledTimes(1);
        });

        expect((api as unknown as { getBattleSnapshot: ReturnType<typeof vi.fn> }).getBattleSnapshot).toHaveBeenCalledWith(
            'l1',
            'g1',
            { playerId: 'p1' },
        );
        expect(applyRemoteOrders).toHaveBeenCalledWith([{ atTick: 50, order: makeOrder('r1') }]);
    });

    it('recovery first tries latest snapshot before targeted mismatch lookup', async () => {
        const loadFromSnapshot = vi.fn();
        const applyRemoteOrders = vi.fn();
        const getBattleSnapshot = vi.fn(async () => ({
            tick: 1,
            state: { gameTick: 1, initialFingerprint: '0011223344556677' } as SerializedGameState,
        }));
        const api = makeApi({
            getBattleFingerprintsRange: vi.fn(async () => ({
                records: [{ tick: 1, fp: 'server1' }],
            })),
            getBattleSnapshot,
            getBattleOrdersRange: vi.fn(async () => ({
                orders: [{ atTick: 2, playerId: 'p2', idHash: 'z1', order: makeOrder('r1') }],
            })),
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 1,
                hostFingerprint: 'aligned1',
                ordersTipTick: 2,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
            })),
        });
        const session = makeSession({
            getEngineTick: () => 1,
            getFingerprintRange: () => [{ tick: 1, fp: 'local1' }],
            getLatestFingerprint: () => ({ tick: 1, fp: 'aligned1' }),
            loadFromSnapshot,
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

        await net.requestResync('hash-mismatch');
        await vi.waitFor(() => {
            expect(loadFromSnapshot).toHaveBeenCalledTimes(1);
        });

        expect(getBattleSnapshot).toHaveBeenCalledTimes(1);
        expect(getBattleSnapshot).toHaveBeenCalledWith('l1', 'g1', { playerId: 'p1' });
        expect(applyRemoteOrders).toHaveBeenCalledWith([{ atTick: 2, order: makeOrder('r1') }]);
    });

    it('falls back to initial-state replay when snapshot is null', async () => {
        const loadFromSnapshot = vi.fn();
        const applyRemoteOrders = vi.fn();
        const api = makeApi({
            getBattleFingerprintsRange: vi.fn(async () => ({
                records: [{ tick: 75, fp: 'host75' }],
            })),
            getBattleSnapshot: vi.fn(async () => null),
            getBattleInitialState: vi.fn(async () => ({
                state: { gameTick: 0 } as SerializedGameState,
                initialFingerprint: '0011223344556677',
            })),
            getBattleOrdersRange: vi.fn(async (_l: string, _g: string, params: { sinceTick?: number }) => ({
                orders:
                    (params.sinceTick ?? 0) === 0
                        ? [{ atTick: 30, playerId: 'p2', idHash: 'i1', order: makeOrder('initial') }]
                        : [],
            })),
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 100,
                hostFingerprint: 'host100',
                ordersTipTick: 100,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
            })),
        });
        const session = makeSession({
            getEngineTick: () => 100,
            getFingerprintRange: () => [{ tick: 75, fp: 'local75' }],
            getLatestFingerprint: () => ({ tick: 100, fp: 'host100' }),
            loadFromSnapshot,
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
        const statuses = vi.fn();
        net.on('sync-status', statuses);

        await net.requestResync('hash-mismatch');
        await vi.waitFor(() => {
            expect(loadFromSnapshot).toHaveBeenCalled();
        });

        expect((api as unknown as { getBattleSnapshot: ReturnType<typeof vi.fn> }).getBattleSnapshot).toHaveBeenCalled();
        expect((api as unknown as { getBattleInitialState: ReturnType<typeof vi.fn> }).getBattleInitialState).toHaveBeenCalled();
        expect(applyRemoteOrders).toHaveBeenCalledWith([{ atTick: 30, order: makeOrder('initial') }]);
        expect(statuses).toHaveBeenCalledWith('synced');
    });

    it('initial-state mismatch tries latest checkpoint then initial-state replay', async () => {
        const loadFromSnapshot = vi.fn();
        const applyRemoteOrders = vi.fn();
        const getBattleSnapshot = vi.fn(async () => null);
        const api = makeApi({
            getBattleInitialState: vi.fn(async () => ({
                state: { gameTick: 0 } as SerializedGameState,
                initialFingerprint: '0011223344556677',
            })),
            getBattleOrdersRange: vi.fn(async () => ({
                orders: [{ atTick: 12, playerId: 'p2', idHash: 'x1', order: makeOrder('x') }],
            })),
            getBattleHeartbeat: vi.fn(async () => ({
                hostTick: 12,
                hostFingerprint: 'aligned12',
                ordersTipTick: 12,
                pausedAtTick: null,
                expectingFromPlayerIds: null,
                initialFingerprint: '0011223344556677',
            })),
            getBattleSnapshot,
            getBattleFingerprintsRange: vi.fn(async () => ({ records: [{ tick: 12, fp: 'host12' }] })),
        });
        const session = makeSession({
            getLatestFingerprint: () => ({ tick: 12, fp: 'aligned12' }),
            loadFromSnapshot,
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

        await net.requestResync('initial-state-mismatch');
        await vi.waitFor(() => {
            expect(loadFromSnapshot).toHaveBeenCalledTimes(1);
        });

        expect(getBattleSnapshot).toHaveBeenCalledWith('l1', 'g1', { playerId: 'p1' });
        expect((api as unknown as { getBattleInitialState: ReturnType<typeof vi.fn> }).getBattleInitialState).toHaveBeenCalledTimes(1);
        expect(applyRemoteOrders).toHaveBeenCalledWith([{ atTick: 12, order: makeOrder('x') }]);
    });

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
            getLatestFingerprint: () => ({ tick: 100, fp: 'fp100' }),
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
            getLatestFingerprint: () => ({ tick: 1, fp: 'fp1' }),
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
            })),
            getBattleOrdersRange: vi.fn(async () => ({ orders: [] })),
        });
        const session = makeSession({
            getEngineTick: () => 100,
            getLatestFingerprint: () => ({ tick: 90, fp: 'fp90' }),
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

    it('saveInitialState skips POST when initial state already exists on server', async () => {
        const saveBattleInitialState = vi.fn(async () => {});
        const getBattleInitialState = vi.fn(async () => ({
            state: { gameTick: 0 } as SerializedGameState,
            initialFingerprint: 'abc',
        }));
        const api = makeApi({ saveBattleInitialState, getBattleInitialState });
        const net = new BattleNet({
            api,
            session: makeSession(),
            isHost: true,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'host',
        });
        await net.saveInitialState();
        expect(getBattleInitialState).toHaveBeenCalled();
        expect(saveBattleInitialState).not.toHaveBeenCalled();
    });

    it('saveInitialState POSTs when server has no initial state yet', async () => {
        const saveBattleInitialState = vi.fn(async () => {});
        const getBattleInitialState = vi.fn(async () => null);
        const api = makeApi({ saveBattleInitialState, getBattleInitialState });
        const net = new BattleNet({
            api,
            session: makeSession(),
            isHost: true,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'host',
        });
        await net.saveInitialState();
        expect(getBattleInitialState).toHaveBeenCalled();
        expect(saveBattleInitialState).toHaveBeenCalledTimes(1);
    });

    it('saveInitialState skips POST when session has no tick-0 baseline (e.g. checkpoint-only host)', async () => {
        const saveBattleInitialState = vi.fn(async () => {});
        const getBattleInitialState = vi.fn(async () => null);
        const api = makeApi({ saveBattleInitialState, getBattleInitialState });
        const net = new BattleNet({
            api,
            session: makeSession({ getPayloadForPersistedInitialStateOrNull: () => null }),
            isHost: true,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'host',
        });
        await net.saveInitialState();
        expect(getBattleInitialState).toHaveBeenCalled();
        expect(saveBattleInitialState).not.toHaveBeenCalled();
    });

    it('saveInitialState does not GET or POST for non-host', async () => {
        const saveBattleInitialState = vi.fn(async () => {});
        const getBattleInitialState = vi.fn(async () => null);
        const api = makeApi({ saveBattleInitialState, getBattleInitialState });
        const net = new BattleNet({
            api,
            session: makeSession(),
            isHost: false,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'p2',
        });
        await net.saveInitialState();
        expect(getBattleInitialState).not.toHaveBeenCalled();
        expect(saveBattleInitialState).not.toHaveBeenCalled();
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
        await net.submitOrder(makeOrder('a'), 5);
        expect(appendBattleOrder).toHaveBeenCalled();
        expect(resync).toHaveBeenCalledWith('tick-in-past');
    });

    it('host saveSnapshotOnPause sends checkpointFingerprint with snapshot (server appends fingerprints)', async () => {
        const saveBattleSnapshot = vi.fn(async () => {});
        const appendBattleFingerprints = vi.fn(async () => ({ appended: 0 }));
        const api = makeApi({
            saveBattleSnapshot,
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
            session: makeSession({
                getEngineTick: () => 25,
                getLatestFingerprint: () => ({ tick: 0, fp: 'fp0' }),
            }),
            isHost: true,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'host',
        });

        await net.saveSnapshotOnPause(25, { gameTick: 25, initialFingerprint: 'checkpoint_fp' } as SerializedGameState);
        await net.pollOnce();

        expect(saveBattleSnapshot).toHaveBeenCalledWith(
            'l1',
            'g1',
            expect.objectContaining({
                tick: 25,
                checkpointFingerprint: 'checkpoint_fp',
            }),
        );
        expect(appendBattleFingerprints).not.toHaveBeenCalled();
    });

    it('saveSnapshotOnPause skips checkpoint fingerprint when engine advanced past pause tick', async () => {
        const appendBattleFingerprints = vi.fn(async () => ({ appended: 0 }));
        let engineTick = 25;
        const saveBattleSnapshot = vi.fn(async () => {
            engineTick = 30;
        });
        const api = makeApi({
            appendBattleFingerprints,
            saveBattleSnapshot,
        });
        const net = new BattleNet({
            api,
            session: makeSession({
                getEngineTick: () => engineTick,
            }),
            isHost: true,
            lobbyId: 'l1',
            gameId: 'g1',
            playerId: 'host',
        });

        await net.saveSnapshotOnPause(25, { gameTick: 25, initialFingerprint: 'checkpoint_fp' } as SerializedGameState);

        expect(saveBattleSnapshot).toHaveBeenCalledWith(
            'l1',
            'g1',
            expect.objectContaining({
                tick: 25,
                checkpointFingerprint: 'checkpoint_fp',
            }),
        );
        expect(appendBattleFingerprints).not.toHaveBeenCalled();
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
                getLatestFingerprint: () => ({ tick: 0, fp: 'aaaaaaaaaaaaaaaa' }),
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
});
