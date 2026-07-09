import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BattleApi, BattleSessionHandle } from './types';
import type { SerializedGameState } from '../types';

const { logToLobbyLog, logToLobbyLogForced } = vi.hoisted(() => ({
    logToLobbyLog: vi.fn(),
    logToLobbyLogForced: vi.fn(),
}));

vi.mock('../../../../lobbyLog', () => ({
    logToLobbyLog,
    logToLobbyLogForced,
}));

import { SnapshotPersistence } from './SnapshotPersistence';

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

function makeApi(overrides: Partial<BattleApi> = {}): BattleApi {
    return {
        appendBattleOrder: vi.fn(async () => ({ accepted: true, idHash: 'ok' })) as unknown as BattleApi['appendBattleOrder'],
        getBattleOrdersRange: vi.fn(async () => ({ orders: [] })) as unknown as BattleApi['getBattleOrdersRange'],
        getBattleSnapshot: vi.fn(async () => null) as unknown as BattleApi['getBattleSnapshot'],
        getBattleHeartbeat: vi.fn() as unknown as BattleApi['getBattleHeartbeat'],
        mergeBattleAppliedOrders: vi.fn(async () => ({ success: true, merged: 0 })) as unknown as BattleApi['mergeBattleAppliedOrders'],
        saveBattleInitialState: vi.fn(async () => {}) as unknown as BattleApi['saveBattleInitialState'],
        getBattleInitialState: vi.fn(async () => null) as unknown as BattleApi['getBattleInitialState'],
        saveBattleSnapshot: vi.fn(async () => {}) as unknown as BattleApi['saveBattleSnapshot'],
        appendBattleFingerprints: vi.fn(async () => ({ appended: 0 })) as unknown as BattleApi['appendBattleFingerprints'],
        getBattleFingerprintsRange: vi.fn(async () => ({ records: [] })) as unknown as BattleApi['getBattleFingerprintsRange'],
        ...overrides,
    };
}

function make(
    args: { isHost?: boolean; api?: Partial<BattleApi>; session?: Partial<BattleSessionHandle> } = {},
): { ctrl: SnapshotPersistence; api: BattleApi; requestResync: ReturnType<typeof vi.fn> } {
    const api = makeApi(args.api ?? {});
    const session = makeSession(args.session ?? {});
    const requestResync = vi.fn();
    const ctrl = new SnapshotPersistence({
        api,
        session,
        isHost: args.isHost ?? true,
        lobbyId: 'l1',
        gameId: 'g1',
        playerId: 'host',
        requestResync,
    });
    return { ctrl, api, requestResync };
}

describe('SnapshotPersistence.saveInitialState', () => {
    it('skips POST when initial state already exists on server', async () => {
        const { ctrl, api } = make({
            api: {
                getBattleInitialState: vi.fn(async () => ({
                    state: { gameTick: 0 } as SerializedGameState,
                    initialFingerprint: 'abc',
                })) as unknown as BattleApi['getBattleInitialState'],
            },
        });
        await ctrl.saveInitialState();
        expect(api.getBattleInitialState).toHaveBeenCalled();
        expect(api.saveBattleInitialState).not.toHaveBeenCalled();
    });

    it('POSTs when server has no initial state yet', async () => {
        const { ctrl, api } = make();
        await ctrl.saveInitialState();
        expect(api.getBattleInitialState).toHaveBeenCalled();
        expect(api.saveBattleInitialState).toHaveBeenCalledTimes(1);
    });

    it('skips POST when session has no tick-0 baseline (checkpoint-only host)', async () => {
        const { ctrl, api } = make({
            session: { getPayloadForPersistedInitialStateOrNull: () => null },
        });
        await ctrl.saveInitialState();
        expect(api.getBattleInitialState).toHaveBeenCalled();
        expect(api.saveBattleInitialState).not.toHaveBeenCalled();
    });

    it('does not GET or POST for non-host clients', async () => {
        const { ctrl, api } = make({ isHost: false });
        await ctrl.saveInitialState();
        expect(api.getBattleInitialState).not.toHaveBeenCalled();
        expect(api.saveBattleInitialState).not.toHaveBeenCalled();
    });
});

describe('SnapshotPersistence.saveSnapshotOnPause', () => {
    it('sends checkpointFingerprint with snapshot when session reports a runtime hash', async () => {
        const { ctrl, api } = make({
            session: {
                getEngineTick: () => 25,
                getRuntimeFingerprintHex: () => 'runtime_checkpoint_fp',
                getFingerprintTailPaused: () => false,
            },
        });
        await ctrl.saveSnapshotOnPause(25, { gameTick: 25 } as SerializedGameState);
        expect(api.saveBattleSnapshot).toHaveBeenCalledWith(
            'l1',
            'g1',
            expect.objectContaining({
                tick: 25,
                checkpointFingerprint: 'runtime_checkpoint_fp',
                checkpointFingerprintPaused: false,
            }),
        );
    });

    it('forwards checkpointFingerprintPaused from session.getFingerprintTailPaused', async () => {
        const { ctrl, api } = make({
            session: {
                getEngineTick: () => 25,
                getRuntimeFingerprintHex: () => 'runtime_checkpoint_fp',
                getFingerprintTailPaused: () => true,
            },
        });
        await ctrl.saveSnapshotOnPause(25, { gameTick: 25 } as SerializedGameState);
        expect(api.saveBattleSnapshot).toHaveBeenCalledWith(
            'l1',
            'g1',
            expect.objectContaining({ checkpointFingerprintPaused: true }),
        );
    });

    it('still records lastSnapshotTick when engine advanced past pause tick during POST', async () => {
        let engineTick = 25;
        const saveBattleSnapshot = vi.fn(async () => {
            engineTick = 30;
        });
        const { ctrl } = make({
            api: { saveBattleSnapshot: saveBattleSnapshot as unknown as BattleApi['saveBattleSnapshot'] },
            session: {
                getEngineTick: () => engineTick,
                getRuntimeFingerprintHex: () => 'runtime_checkpoint_fp',
            },
        });
        await ctrl.saveSnapshotOnPause(25, { gameTick: 25 } as SerializedGameState);
        expect(saveBattleSnapshot).toHaveBeenCalledOnce();
        expect(ctrl.getLastSnapshotTick()).toBe(25);
    });

    it('is a no-op for non-host clients and when called twice with the same tick', async () => {
        const { ctrl, api } = make({ isHost: false });
        await ctrl.saveSnapshotOnPause(10, { gameTick: 10 } as SerializedGameState);
        expect(api.saveBattleSnapshot).not.toHaveBeenCalled();

        const host = make({});
        await host.ctrl.saveSnapshotOnPause(10, { gameTick: 10 } as SerializedGameState);
        await host.ctrl.saveSnapshotOnPause(10, { gameTick: 10 } as SerializedGameState);
        expect(host.api.saveBattleSnapshot).toHaveBeenCalledTimes(1);
    });
});

describe('SnapshotPersistence.mergeAppliedOrdersForBatch', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns true immediately for non-host or invalid batch ticks', async () => {
        const nonHost = make({ isHost: false });
        await expect(nonHost.ctrl.mergeAppliedOrdersForBatch(5)).resolves.toBe(true);
        expect(nonHost.api.mergeBattleAppliedOrders).not.toHaveBeenCalled();

        const host = make();
        await expect(host.ctrl.mergeAppliedOrdersForBatch(0)).resolves.toBe(true);
        expect(host.api.mergeBattleAppliedOrders).not.toHaveBeenCalled();
    });

    it('retries mergeBattleAppliedOrders on failure then succeeds', async () => {
        const mergeBattleAppliedOrders = vi
            .fn()
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce({ success: true, merged: 1 });
        const { ctrl, requestResync } = make({
            api: { mergeBattleAppliedOrders: mergeBattleAppliedOrders as unknown as BattleApi['mergeBattleAppliedOrders'] },
        });
        await expect(ctrl.mergeAppliedOrdersForBatch(5)).resolves.toBe(true);
        expect(mergeBattleAppliedOrders).toHaveBeenCalledTimes(2);
        expect(requestResync).not.toHaveBeenCalled();
    });

    it('triggers requestResync after exhausted retries', async () => {
        const mergeBattleAppliedOrders = vi.fn().mockResolvedValue({ success: false });
        const { ctrl, requestResync } = make({
            api: { mergeBattleAppliedOrders: mergeBattleAppliedOrders as unknown as BattleApi['mergeBattleAppliedOrders'] },
        });
        await expect(ctrl.mergeAppliedOrdersForBatch(3)).resolves.toBe(false);
        expect(mergeBattleAppliedOrders).toHaveBeenCalledTimes(3);
        expect(requestResync).toHaveBeenCalledWith('merge-applied-failed');
    });
});

describe('SnapshotPersistence.debugLogLocalStateAndSubmitSnapshot', () => {
    beforeEach(() => {
        logToLobbyLog.mockClear();
        logToLobbyLogForced.mockClear();
    });

    it('POSTs serialized state via logToLobbyLogForced (ignores debug-console thresholds)', async () => {
        const { ctrl, api } = make({
            isHost: false,
            session: {
                getSerializedSnapshot: () => ({ gameTick: 849 } as SerializedGameState),
            },
        });
        await ctrl.debugLogLocalStateAndSubmitSnapshot();
        expect(logToLobbyLogForced).toHaveBeenCalledOnce();
        expect(logToLobbyLogForced).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'debug: local serialized game state',
                manualLobbyLogPost: true,
                tick: 849,
            }),
        );
        expect(logToLobbyLog).not.toHaveBeenCalled();
        expect(api.saveBattleSnapshot).not.toHaveBeenCalled();
    });
});

describe('SnapshotPersistence bootstrap tick tracking', () => {
    it('lastBootstrapSnapshotTick get/set roundtrips', () => {
        const { ctrl } = make();
        expect(ctrl.getLastBootstrapSnapshotTick()).toBeNull();
        ctrl.setLastBootstrapSnapshotTick(42);
        expect(ctrl.getLastBootstrapSnapshotTick()).toBe(42);
        ctrl.setLastBootstrapSnapshotTick(null);
        expect(ctrl.getLastBootstrapSnapshotTick()).toBeNull();
    });
});
