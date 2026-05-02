/**
 * Two-player order turn test: verifies parallel order batches (multiple human waiters
 * per pause), deterministic resume only after all orders, and turn_end batch semantics.
 */
import { describe, it, expect, vi } from 'vitest';
import { GameEngine } from './GameEngine';
import { Unit } from './units/Unit';
import { resetGameObjectIdCounter } from './GameObject';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import type { BattleOrder, WaitingForOrders } from './types';

const FIXED_DT = 1 / 60;

/**
 * Step the engine forward by calling fixedUpdate repeatedly.
 * Stops early if the engine pauses for orders. Returns the number of
 * ticks actually advanced.
 */
function stepEngine(engine: GameEngine, maxTicks: number): number {
    let ticks = 0;
    for (let i = 0; i < maxTicks; i++) {
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
        ticks++;
        if (engine.waitingForOrders) break;
    }
    return ticks;
}

/** Order pause is deferred to the next tick boundary; may require more than one fixed step. */
function advanceUntilOrderPause(engine: GameEngine, maxSteps = 24): void {
    for (let i = 0; i < maxSteps; i++) {
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
        if (engine.waitingForOrders != null) return;
    }
    throw new Error('expected waitingForOrders within maxSteps');
}

/** Create a minimal engine with two player-controlled units on a flat map. */
function createTwoPlayerEngine(): {
    engine: GameEngine;
    unitP1: Unit;
    unitP2: Unit;
} {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1' });

    const startCol = 5;
    const startRow = 5;

    const unitP1 = new Unit({
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
    });

    const unitP2 = new Unit({
        id: 'unit_p2',
        x: (startCol + 3) * CELL_SIZE + CELL_SIZE / 2,
        y: startRow * CELL_SIZE + CELL_SIZE / 2,
        hp: 100,
        maxHp: 100,
        speed: 120,
        teamId: 'player',
        ownerId: 'p2',
        characterId: 'player',
        portraitId: 'ranger',
        name: 'Player 2',
    });

    engine.addUnit(unitP1);
    engine.addUnit(unitP2);

    return { engine, unitP1, unitP2 };
}

function makeWaitOrder(unitId: string, moveCol: number, moveRow: number): BattleOrder {
    return {
        unitId,
        abilityId: 'wait',
        targets: [],
        movePath: [{ col: moveCol, row: moveRow }],
    };
}

describe('Two-player order turns', () => {
    it('pauses once with both player units in the parallel waiter list', () => {
        const { engine } = createTwoPlayerEngine();

        advanceUntilOrderPause(engine);

        expect(engine.waitingForOrders).not.toBeNull();
        const w = engine.waitingForOrders!;
        expect(w.waiters.map((x) => x.ownerId).sort()).toEqual(['p1', 'p2']);
        expect(w.waiters.map((x) => x.unitId).sort()).toEqual(['unit_p1', 'unit_p2']);

        engine.destroy();
    });

    it('stays paused until both players submit in the same batch', () => {
        const { engine } = createTwoPlayerEngine();

        advanceUntilOrderPause(engine);
        expect(engine.waitingForOrders).not.toBeNull();

        engine.applyOrder(makeWaitOrder('unit_p1', 6, 5));
        expect(engine.waitingForOrders).not.toBeNull();

        engine.applyOrder(makeWaitOrder('unit_p2', 9, 5));
        expect(engine.waitingForOrders).toBeNull();

        engine.destroy();
    });

    it('emits a single turn_end with both unitIds when the parallel batch completes', () => {
        const { engine } = createTwoPlayerEngine();
        const emitSpy = vi.spyOn(engine.eventBus, 'emit');

        advanceUntilOrderPause(engine);
        engine.applyOrder(makeWaitOrder('unit_p1', 6, 5));
        engine.applyOrder(makeWaitOrder('unit_p2', 9, 5));

        const turnEnds = emitSpy.mock.calls.filter((c) => c[0] === 'turn_end');
        expect(turnEnds).toHaveLength(1);
        expect(turnEnds[0]![1]).toMatchObject({
            unitIds: ['unit_p1', 'unit_p2'],
        });

        emitSpy.mockRestore();
        engine.destroy();
    });

    it('after both submit, advances and later pauses again for the next round', () => {
        const { engine } = createTwoPlayerEngine();

        advanceUntilOrderPause(engine);
        expect(engine.waitingForOrders!.waiters).toHaveLength(2);

        engine.applyOrder(makeWaitOrder('unit_p1', 6, 5));
        engine.applyOrder(makeWaitOrder('unit_p2', 9, 5));
        expect(engine.waitingForOrders).toBeNull();

        stepEngine(engine, 300);

        expect(engine.waitingForOrders).not.toBeNull();
        expect(engine.waitingForOrders!.waiters.length).toBeGreaterThanOrEqual(1);

        engine.destroy();
    });

    it('tracks the onWaitingForOrders callback once per pause (not per partial submit)', () => {
        const { engine } = createTwoPlayerEngine();

        const turnLog: WaitingForOrders[] = [];
        engine.setOnWaitingForOrders((info) => {
            turnLog.push({
                waiters: info.waiters.map((w) => ({ ...w })),
                atTick: info.atTick,
            });
        });

        advanceUntilOrderPause(engine);
        expect(turnLog).toHaveLength(1);
        expect(turnLog[0]!.waiters).toHaveLength(2);

        engine.applyOrder(makeWaitOrder('unit_p1', 6, 5));
        expect(turnLog).toHaveLength(1);

        engine.applyOrder(makeWaitOrder('unit_p2', 9, 5));
        expect(turnLog).toHaveLength(1);

        stepEngine(engine, 300);
        expect(turnLog.length).toBeGreaterThanOrEqual(2);

        engine.destroy();
    });

    it('advances gameTick and gameTime after a full batch', () => {
        const { engine } = createTwoPlayerEngine();

        advanceUntilOrderPause(engine);
        const tick1 = engine.gameTick;
        const time1 = engine.gameTime;

        engine.applyOrder(makeWaitOrder('unit_p1', 6, 5));
        engine.applyOrder(makeWaitOrder('unit_p2', 9, 5));
        stepEngine(engine, 5);

        expect(engine.gameTick).toBeGreaterThan(tick1);
        expect(engine.gameTime).toBeGreaterThan(time1);

        engine.destroy();
    });

    it('snapshotIndex increments on pause but not on partial batch submit', () => {
        const { engine } = createTwoPlayerEngine();

        advanceUntilOrderPause(engine);
        const snapPause = engine.snapshotIndex;

        engine.applyOrder(makeWaitOrder('unit_p1', 6, 5));
        expect(engine.snapshotIndex).toBe(snapPause);

        engine.applyOrder(makeWaitOrder('unit_p2', 9, 5));
        expect(engine.waitingForOrders).toBeNull();

        stepEngine(engine, 300);
        expect(engine.snapshotIndex).toBe(snapPause + 1);

        engine.destroy();
    });

    it('simulates remote order delivery via queueOrder + tryResumeParallel', () => {
        const { engine } = createTwoPlayerEngine();

        advanceUntilOrderPause(engine);
        expect(engine.waitingForOrders!.waiters.some((w) => w.ownerId === 'p1')).toBe(true);

        engine.applyOrder(makeWaitOrder('unit_p1', 6, 5));
        expect(engine.waitingForOrders).not.toBeNull();

        const atTick = engine.waitingForOrders!.atTick;
        engine.queueOrder(atTick, makeWaitOrder('unit_p2', 9, 5));
        engine.tryResumeParallel();

        expect(engine.waitingForOrders).toBeNull();

        stepEngine(engine, 300);
        expect(engine.waitingForOrders).not.toBeNull();

        engine.destroy();
    });

    it('handles three consecutive full cycles without errors', () => {
        const { engine, unitP1, unitP2 } = createTwoPlayerEngine();
        let p1Col = 5;
        let p2Col = 8;

        for (let cycle = 0; cycle < 3; cycle++) {
            stepEngine(engine, 300);
            const batch = engine.waitingForOrders;
            expect(batch).not.toBeNull();

            for (const waiter of batch!.waiters) {
                if (waiter.unitId === 'unit_p1') {
                    p1Col++;
                    engine.applyOrder(makeWaitOrder('unit_p1', p1Col, 5));
                } else if (waiter.unitId === 'unit_p2') {
                    p2Col++;
                    engine.applyOrder(makeWaitOrder('unit_p2', p2Col, 5));
                }
            }
            expect(engine.waitingForOrders).toBeNull();
        }

        expect(unitP1.isAlive()).toBe(true);
        expect(unitP2.isAlive()).toBe(true);

        stepEngine(engine, 300);
        expect(engine.waitingForOrders).not.toBeNull();

        engine.destroy();
    });
});
