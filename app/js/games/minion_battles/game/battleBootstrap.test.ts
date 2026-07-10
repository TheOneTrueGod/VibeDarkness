import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlayerState } from '../../../types';
import type { MinionBattlesApi } from '../api/minionBattlesApi';
import type { BattleSession } from './BattleSession';
import type { BattleNet } from './battlenet';
import { runBattleBootstrap } from './battleBootstrap';

vi.mock('./fetchBattleAssets', () => ({
    fetchBattleAssets: vi.fn().mockResolvedValue({ terrainSegmentsFromApi: 0 }),
}));

vi.mock('../../../lobbyLog', () => ({
    logToLobbyLog: vi.fn().mockResolvedValue(undefined),
}));

import { fetchBattleAssets } from './fetchBattleAssets';

const PLAYERS: Record<string, PlayerState> = {
    p1: { id: 'p1', name: 'P1', color: '#fff' },
};
const CHARACTER_SELECTIONS = { p1: 'warrior' };

function makeApiStub(): MinionBattlesApi {
    return {
        getLobbyClient: vi.fn().mockReturnValue({}),
        getLobbyId: vi.fn().mockReturnValue('lobby-1'),
        getGameId: vi.fn().mockReturnValue('game-1'),
    } as unknown as MinionBattlesApi;
}

function makeSessionStub(): BattleSession {
    return {
        updateLobbyContext: vi.fn(),
        setNetAdapter: vi.fn(),
        load: vi.fn().mockResolvedValue(undefined),
        startEngine: vi.fn(),
    } as unknown as BattleSession;
}

function makeNetStub(): BattleNet {
    return {
        stop: vi.fn(),
        tryBootstrapFromLatestCheckpoint: vi.fn().mockResolvedValue(false),
        saveInitialState: vi.fn().mockResolvedValue(undefined),
        start: vi.fn(),
    } as unknown as BattleNet;
}

describe('runBattleBootstrap', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fetchBattleAssets).mockResolvedValue({ terrainSegmentsFromApi: 0 });
    });

    it('completes load when alive through all awaits', async () => {
        const session = makeSessionStub();
        const net = makeNetStub();
        const netRef = { current: net as BattleNet | null };
        const bumpOrderPipeline = vi.fn();

        await runBattleBootstrap({
            session,
            net,
            netRef,
            api: makeApiStub(),
            missionId: 'dark_awakening',
            playerId: 'p1',
            isHost: false,
            players: PLAYERS,
            characterSelections: CHARACTER_SELECTIONS,
            initialGameState: { battleSeed: 42 },
            isAlive: () => true,
            onPhase: vi.fn(),
            wireNet: () => ({ unsubscribe: vi.fn(), bumpOrderPipeline }),
            registerCleanup: vi.fn(),
            onFatalMissingSeed: vi.fn(),
        });

        expect(fetchBattleAssets).toHaveBeenCalled();
        expect(net.tryBootstrapFromLatestCheckpoint).toHaveBeenCalled();
        expect(session.load).toHaveBeenCalled();
        expect(session.startEngine).toHaveBeenCalled();
        expect(net.start).toHaveBeenCalled();
        expect(bumpOrderPipeline).toHaveBeenCalled();
    });

    it('tears down net when unmounted after fetchBattleAssets', async () => {
        let alive = true;
        vi.mocked(fetchBattleAssets).mockImplementationOnce(async () => {
            alive = false;
            return { terrainSegmentsFromApi: 0 };
        });

        const session = makeSessionStub();
        const net = makeNetStub();
        const netRef = { current: net as BattleNet | null };

        await runBattleBootstrap({
            session,
            net,
            netRef,
            api: makeApiStub(),
            missionId: 'dark_awakening',
            playerId: 'p1',
            isHost: false,
            players: PLAYERS,
            characterSelections: CHARACTER_SELECTIONS,
            initialGameState: { battleSeed: 42 },
            isAlive: () => alive,
            onPhase: vi.fn(),
            wireNet: vi.fn(),
            registerCleanup: vi.fn(),
            onFatalMissingSeed: vi.fn(),
        });

        expect(net.stop).toHaveBeenCalled();
        expect(session.setNetAdapter).toHaveBeenCalledWith(null);
        expect(netRef.current).toBeNull();
        expect(net.tryBootstrapFromLatestCheckpoint).not.toHaveBeenCalled();
        expect(session.startEngine).not.toHaveBeenCalled();
    });

    it('calls onFatalMissingSeed when battleSeed is absent', async () => {
        const session = makeSessionStub();
        const net = makeNetStub();
        const netRef = { current: net as BattleNet | null };
        const onFatalMissingSeed = vi.fn();

        await runBattleBootstrap({
            session,
            net,
            netRef,
            api: makeApiStub(),
            missionId: 'dark_awakening',
            playerId: 'p1',
            isHost: false,
            players: PLAYERS,
            characterSelections: CHARACTER_SELECTIONS,
            initialGameState: {},
            isAlive: () => true,
            onPhase: vi.fn(),
            wireNet: vi.fn(),
            registerCleanup: vi.fn(),
            onFatalMissingSeed,
        });

        expect(onFatalMissingSeed).toHaveBeenCalled();
        expect(session.load).not.toHaveBeenCalled();
        expect(session.startEngine).not.toHaveBeenCalled();
    });

    it('onPhase(ready) immediately precedes startEngine (T3)', async () => {
        const order: string[] = [];
        const session = makeSessionStub();
        vi.mocked(session.startEngine).mockImplementation(() => {
            order.push('startEngine');
        });
        const net = makeNetStub();
        vi.mocked(net.start).mockImplementation(() => {
            order.push('net.start');
        });

        await runBattleBootstrap({
            session,
            net,
            netRef: { current: net as BattleNet | null },
            api: makeApiStub(),
            missionId: 'dark_awakening',
            playerId: 'p1',
            isHost: true,
            players: PLAYERS,
            characterSelections: CHARACTER_SELECTIONS,
            initialGameState: { battleSeed: 1 },
            isAlive: () => true,
            onPhase: (phase) => order.push(`phase:${phase}`),
            wireNet: () => ({
                unsubscribe: vi.fn(),
                bumpOrderPipeline: () => order.push('bumpOrderPipeline'),
            }),
            registerCleanup: vi.fn(),
            onFatalMissingSeed: vi.fn(),
        });

        const readyIdx = order.indexOf('phase:ready');
        const startIdx = order.indexOf('startEngine');
        expect(readyIdx).toBeGreaterThan(order.indexOf('phase:submitting'));
        expect(startIdx).toBe(readyIdx + 1);
        expect(order[startIdx + 1]).toBe('net.start');
        expect(order[startIdx + 2]).toBe('bumpOrderPipeline');
    });
});
