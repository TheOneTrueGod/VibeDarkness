import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LobbyClient } from '../../../LobbyClient';
import type { BattleOrder, SerializedGameState } from './types';
import { BattleNet, type BattleSessionHandle } from './BattleNet';

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
        loadFromSnapshot: () => {},
        applyRemoteOrders: () => {},
        ...overrides,
    };
}

function makeApi(overrides: Record<string, unknown> = {}): LobbyClient {
    const api = {
        appendBattleOrder: vi.fn(async (_lobbyId: string, _gameId: string, body: { idHash?: string }) => ({
            accepted: true,
            idHash: body.idHash ?? 'idhash',
        })),
        getBattleOrdersRange: vi.fn(async () => ({ orders: [] })),
        getBattleHeartbeat: vi.fn(async () => ({
            hostTick: 0,
            hostFingerprint: 'aaaaaaaaaaaaaaaa',
            ordersTipTick: 0,
            pausedAtTick: null,
            expectingFromPlayerIds: null,
            initialFingerprint: '0011223344556677',
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
                pausedAtTick: 100,
                expectingFromPlayerIds: ['p2'],
                initialFingerprint: '0011223344556677',
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

    it('requests resync when equal tick fingerprints mismatch', async () => {
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
            { playerId: 'p1', atTick: 49 },
        );
        expect(applyRemoteOrders).toHaveBeenCalledWith([{ atTick: 50, order: makeOrder('r1') }]);
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

    it('uses direct initial-state replay for initial-state mismatch reason', async () => {
        const loadFromSnapshot = vi.fn();
        const applyRemoteOrders = vi.fn();
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
            getBattleSnapshot: vi.fn(async () => null),
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

        expect((api as unknown as { getBattleSnapshot: ReturnType<typeof vi.fn> }).getBattleSnapshot).not.toHaveBeenCalled();
        expect((api as unknown as { getBattleInitialState: ReturnType<typeof vi.fn> }).getBattleInitialState).toHaveBeenCalledTimes(1);
        expect(applyRemoteOrders).toHaveBeenCalledWith([{ atTick: 12, order: makeOrder('x') }]);
    });

    it('submitOrder applies local order only once for duplicate submissions', async () => {
        const applyRemoteOrders = vi.fn();
        const api = makeApi();
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

        expect(applyRemoteOrders).toHaveBeenCalledTimes(1);
        expect((api as unknown as { appendBattleOrder: ReturnType<typeof vi.fn> }).appendBattleOrder).toHaveBeenCalledTimes(2);
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
});
