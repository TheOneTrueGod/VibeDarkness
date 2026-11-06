/**
 * A snapshot taken while a sustained cast behaviour is mid-window (a wolf lunge, a dash) must
 * restore to an engine that plays forward identically to the one that never restored.
 *
 * Playtest 0003, lobby DA8A43 tick 1235: a non-host ITS rollback restored its mark while a wolf's
 * Dark Wolf Bite lunge was in its last window tick. The restored engine dropped the lunge
 * (`Unit.activeCastBehaviours` is runtime-only), the wolf stopped short, and the client split from
 * the host ten ticks later — then hit "all recovery tiers failed; reloading page".
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BattleSession } from './BattleSession';
import type { GameEngine } from './GameEngine';
import { resetGameObjectIdCounter } from './GameObject';
import type { MinionBattlesApi } from '../api/minionBattlesApi';

const PLAYER_ID = 'p1';

// Sessions start the engine loop; the test steps ticks by hand, so frames never fire.
beforeAll(() => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterAll(() => {
    vi.unstubAllGlobals();
});

function makeApiStub(): MinionBattlesApi {
    return {
        setCurrentPlayerId: vi.fn(),
        sendMessage: vi.fn().mockResolvedValue({ messageId: 1 }),
    } as unknown as MinionBattlesApi;
}

async function mountSession(): Promise<BattleSession> {
    resetGameObjectIdCounter(1);
    const session = new BattleSession({ api: makeApiStub(), missionId: 'dark_awakening', playerId: PLAYER_ID, isHost: true });
    await session.load({
        players: { [PLAYER_ID]: { id: PLAYER_ID, name: 'P1', color: '#fff' } },
        characterSelections: { [PLAYER_ID]: 'warrior' },
        battleSeed: 1,
    });
    session.getEngine()!.stop();
    return session;
}

/** Answer every order pause with Wait so enemies keep acting. */
function stepOne(engine: GameEngine): void {
    if (engine.waitingForOrders) {
        for (const w of engine.waitingForOrders.waiters) {
            engine.state.orderMgr.applyOrder({ unitId: w.unitId, abilityId: 'wait', targets: [], endTurn: true });
        }
        engine.tryResumeParallel();
    }
    engine.isPaused = false;
    engine.stepSimulationFixedTicks(1);
}

function hasMidWindowCastBehaviour(engine: GameEngine): boolean {
    return engine.units.some((u) => u.isAlive() && u.activeCastBehaviours.size > 0);
}

function positions(engine: GameEngine): string[] {
    return engine.units.map((u) => `${u.id}:${u.x.toFixed(6)},${u.y.toFixed(6)}:${u.hp}`);
}

describe('snapshot restore while a sustained cast behaviour is mid-window', () => {
    it('plays forward identically to the engine that never restored', async () => {
        const live = await mountSession();
        const engineA = live.getEngine()!;

        let found = false;
        for (let i = 0; i < 6000 && !found; i++) {
            stepOne(engineA);
            found = hasMidWindowCastBehaviour(engineA);
        }
        expect(found, 'an enemy should start a lunge/dash within the first rounds').toBe(true);

        const mark = engineA.toJSON();
        // The runtime fingerprint is a running hash; checkpoints carry it forward (as ITS marks do).
        mark.checkpointRuntimeFingerprintHex = engineA.getRuntimeFingerprintHex();
        const restored = await mountSession();
        restored.restoreFromInMemorySnapshot(mark);
        const engineB = restored.getEngine()!;
        engineB.stop();
        expect(engineB.gameTick).toBe(engineA.gameTick);

        for (let i = 0; i < 30; i++) {
            stepOne(engineA);
            stepOne(engineB);
            expect(positions(engineB), `tick ${engineA.gameTick}`).toEqual(positions(engineA));
        }
        expect(engineB.getRuntimeFingerprintHex()).toBe(engineA.getRuntimeFingerprintHex());

        engineA.destroy();
        engineB.destroy();
    });
});
