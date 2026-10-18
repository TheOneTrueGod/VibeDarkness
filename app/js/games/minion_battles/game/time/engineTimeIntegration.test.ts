import { describe, it, expect } from 'vitest';
import { GameEngine } from '../GameEngine';
import { resetGameObjectIdCounter } from '../GameObject';
import { DARK_AWAKENING } from '../../storylines/WorldOfDarkness/missions/001_dark_awakening';
import { FIXED_DT } from '../gameConstants';
import { fingerprintToHex } from '../Fingerprint';

function makeEngine(): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
    DARK_AWAKENING.initializeGameState(engine, {
        playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: { p1: ['004'] },
    });
    engine.isPaused = false;
    return engine;
}

/** Advance `n` ticks, auto-answering parallel order pauses with `wait` (as lockstepDeterminism.test does). */
function runTicks(engine: GameEngine, n: number): void {
    const target = engine.gameTick + n;
    let guard = 0;
    while (engine.gameTick < target && guard++ < n * 4 + 20) {
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
        const waiting = engine.waitingForOrders;
        if (waiting) {
            for (const waiter of waiting.waiters) {
                if (engine.state.orderMgr.hasAnyPendingOrderForUnit(waiter.unitId, waiting.atTick)) continue;
                engine.state.orderMgr.queueOrder(waiting.atTick, {
                    unitId: waiter.unitId,
                    abilityId: 'wait',
                    targets: [],
                    endTurn: true,
                });
            }
            engine.tryResumeParallel();
        }
    }
}

describe('engine time integration', () => {
    it('pace 1: gameTime is the exact repeated sum of FIXED_DT', () => {
        const engine = makeEngine();
        let expected = engine.gameTime;
        const tick0 = engine.gameTick;
        runTicks(engine, 30);
        for (let i = 0; i < engine.gameTick - tick0; i++) expected += FIXED_DT;
        expect(engine.gameTime).toBe(expected);
        expect(engine.worldPace).toBe(1);
        expect(engine.tickTime).toBe(engine.gameTick * FIXED_DT);
        expect(engine.toJSON().timeManager).toBeUndefined();
        engine.destroy();
    });

    it('forced pace 0.5 halves gameTime advance; ticks and tickTime advance normally', () => {
        const engine = makeEngine();
        const t0 = engine.gameTime;
        const tick0 = engine.gameTick;
        (engine as unknown as { collectFocalRequests: () => number[] }).collectFocalRequests = () => [0.5];
        runTicks(engine, 20);
        expect(engine.worldPace).toBe(0.5);
        const ticks = engine.gameTick - tick0;
        expect(ticks).toBe(20);
        expect(engine.gameTime - t0).toBeCloseTo(ticks * FIXED_DT * 0.5, 9);
        expect(engine.tickTime).toBeCloseTo(engine.gameTick * FIXED_DT, 12);
        engine.destroy();
    });

    it('Time Stop holds gameTime and round-trips mid-stop', () => {
        const engine = makeEngine();
        runTicks(engine, 5);
        engine.timeManager.startTimeStop({ durationTickSeconds: 30 * FIXED_DT }, engine.gameTick);
        const frozenAt = engine.gameTime;
        runTicks(engine, 10);
        expect(engine.gameTime).toBe(frozenAt);
        expect(engine.worldPace).toBe(0);

        const json = JSON.parse(JSON.stringify(engine.toJSON()));
        expect(json.timeManager.timeStops).toHaveLength(1);
        const restored = GameEngine.fromJSON(json, 'p1', engine.terrainManager, {
            checkpointRuntimeFingerprintHex: fingerprintToHex(engine.runtimeFingerprint),
        });
        restored.isPaused = false;
        expect(restored.timeManager.timeStops).toHaveLength(1);
        runTicks(engine, 30);
        runTicks(restored, 30);
        expect(engine.gameTime).toBeGreaterThan(frozenAt);
        expect(engine.worldPace).toBe(1);
        expect(restored.worldPace).toBe(1);
        expect(restored.gameTime).toBe(engine.gameTime);
        expect(restored.gameTick).toBe(engine.gameTick);
        engine.destroy();
        restored.destroy();
    });
});
