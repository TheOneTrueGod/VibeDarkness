import { describe, expect, it } from 'vitest';
import { GameEngine } from './GameEngine';
import { Unit } from './units/Unit';
import { resetGameObjectIdCounter } from './GameObject';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import type { BattleOrder, SerializedGameState } from './types';

const FIXED_DT = 1 / 60;

function createTwoPlayerEngine(): GameEngine {
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 42 });
    const startCol = 6;
    const startRow = 6;
    engine.addUnit(
        new Unit({
            id: 'unit_p1',
            x: startCol * CELL_SIZE + CELL_SIZE / 2,
            y: startRow * CELL_SIZE + CELL_SIZE / 2,
            hp: 100,
            maxHp: 100,
            speed: 120,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            portraitId: 'warrior',
            name: 'Player 1',
        }),
    );
    engine.addUnit(
        new Unit({
            id: 'unit_p2',
            x: (startCol + 2) * CELL_SIZE + CELL_SIZE / 2,
            y: startRow * CELL_SIZE + CELL_SIZE / 2,
            hp: 100,
            maxHp: 100,
            speed: 120,
            teamId: 'player',
            ownerId: 'p2',
            characterId: 'player',
            portraitId: 'ranger',
            name: 'Player 2',
        }),
    );
    return engine;
}

function fixedUpdate(engine: GameEngine): void {
    (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
}

function makeScriptedWaitOrder(engine: GameEngine, atTick: number, unitId: string): BattleOrder {
    const unit = engine.getUnit(unitId);
    if (!unit) {
        throw new Error(`missing unit ${unitId}`);
    }
    const col = Math.floor(unit.x / CELL_SIZE);
    const row = Math.floor(unit.y / CELL_SIZE);
    const moveDelta = (atTick + unitId.length) % 2 === 0 ? 1 : -1;
    return {
        unitId,
        abilityId: 'wait',
        targets: [],
        movePath: [{ col: col + moveDelta, row }],
        endTurn: true,
    };
}

type CapturedOrder = { atTick: number; order: BattleOrder };

/**
 * Same control flow as multiplayer: step the sim, then only queue orders when the engine
 * is paused for that batch. Pre-queuing all orders before the first tick skips
 * `deferredOrderPause` / pause-commit frames and desynchronizes fingerprints.
 */
function runScenario(
    initialState: SerializedGameState,
    mode: 'live' | 'replay',
    replayQueue: CapturedOrder[],
    expectedLayoutFingerprint: string,
): { engine: GameEngine; finalFingerprintHex: string; captured: CapturedOrder[] } {
    resetGameObjectIdCounter(1);
    const engine = GameEngine.fromJSON(initialState, 'p1', null);
    expect(engine.computeInitialFingerprint()).toBe(expectedLayoutFingerprint);
    const captured: CapturedOrder[] = [];
    let replayIdx = 0;

    while (engine.gameTick < 160) {
        fixedUpdate(engine);
        const waiting = engine.waitingForOrders;
        if (!waiting) continue;
        for (const waiter of waiting.waiters) {
            if (engine.state.orderMgr.hasPendingOrderForUnit(waiter.unitId, waiting.atTick)) continue;
            if (mode === 'live') {
                const order = makeScriptedWaitOrder(engine, waiting.atTick, waiter.unitId);
                captured.push({ atTick: waiting.atTick, order });
                engine.state.orderMgr.queueOrder(waiting.atTick, order);
            } else {
                const rec = replayQueue[replayIdx];
                if (!rec) {
                    throw new Error(`replay underrun at index ${replayIdx}`);
                }
                replayIdx += 1;
                expect(rec.atTick).toBe(waiting.atTick);
                expect(rec.order.unitId).toBe(waiter.unitId);
                engine.state.orderMgr.queueOrder(waiting.atTick, rec.order);
            }
        }
        engine.tryResumeParallel();
    }

    if (mode === 'replay') {
        expect(replayIdx).toBe(replayQueue.length);
    }

    return {
        engine,
        finalFingerprintHex: engine.getRuntimeFingerprintHex(),
        captured: mode === 'live' ? captured : [],
    };
}

describe('replay round-trip', () => {
    it('rebuilds from initial state + orders and reaches matching final fingerprint', () => {
        resetGameObjectIdCounter(1);
        const seedEngine = createTwoPlayerEngine();
        const initialState = seedEngine.toJSON() as SerializedGameState;
        const expectedLayoutFingerprint = seedEngine.computeInitialFingerprint();
        seedEngine.destroy();

        const live = runScenario(initialState, 'live', [], expectedLayoutFingerprint);
        expect(live.captured.length).toBeGreaterThan(0);
        const finalA = live.finalFingerprintHex;
        const tickA = live.engine.gameTick;
        live.engine.destroy();

        const replay = runScenario(initialState, 'replay', live.captured, expectedLayoutFingerprint);
        expect(replay.finalFingerprintHex).toBe(finalA);
        expect(replay.engine.gameTick).toBe(tickA);
        replay.engine.destroy();
    });
});
