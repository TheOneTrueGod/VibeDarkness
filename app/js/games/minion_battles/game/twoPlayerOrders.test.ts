/**
 * Two-player order turn test: verifies that in a minimal two-player setup,
 * the engine correctly alternates between players when each submits wait
 * orders with small (1-tile) movement, and that the game state advances
 * smoothly through multiple turn cycles.
 */
import { describe, it, expect } from 'vitest';
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
        (engine as any).fixedUpdate(FIXED_DT);
        ticks++;
        if (engine.waitingForOrders) break;
    }
    return ticks;
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
        characterId: 'warrior',
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
        characterId: 'ranger',
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
    it('pauses for player 1 on the first tick', () => {
        const { engine } = createTwoPlayerEngine();

        stepEngine(engine, 1);

        expect(engine.waitingForOrders).not.toBeNull();
        expect(engine.waitingForOrders!.ownerId).toBe('p1');
        expect(engine.waitingForOrders!.unitId).toBe('unit_p1');

        engine.destroy();
    });

    it('resumes after player 1 submits a wait order', () => {
        const { engine } = createTwoPlayerEngine();

        stepEngine(engine, 1);
        expect(engine.waitingForOrders).not.toBeNull();

        engine.applyOrder(makeWaitOrder('unit_p1', 6, 5));

        expect(engine.waitingForOrders).toBeNull();

        engine.destroy();
    });

    it('pauses for player 2 after player 1 submits', () => {
        const { engine } = createTwoPlayerEngine();

        stepEngine(engine, 1);
        expect(engine.waitingForOrders!.ownerId).toBe('p1');

        engine.applyOrder(makeWaitOrder('unit_p1', 6, 5));

        // Advance; p2's unit also has canAct() = true, so engine should pause
        // for p2 within a few ticks (it needs to process the queued order first).
        stepEngine(engine, 5);

        expect(engine.waitingForOrders).not.toBeNull();
        expect(engine.waitingForOrders!.ownerId).toBe('p2');
        expect(engine.waitingForOrders!.unitId).toBe('unit_p2');

        engine.destroy();
    });

    it('completes a full turn cycle: p1 → p2 → p1', () => {
        const { engine } = createTwoPlayerEngine();

        // --- Turn 1: Player 1 ---
        stepEngine(engine, 1);
        expect(engine.waitingForOrders!.ownerId).toBe('p1');
        const tickBeforeP1Order = engine.gameTick;

        engine.applyOrder(makeWaitOrder('unit_p1', 6, 5));
        expect(engine.waitingForOrders).toBeNull();

        // --- Turn 1: Player 2 ---
        stepEngine(engine, 5);
        expect(engine.waitingForOrders).not.toBeNull();
        expect(engine.waitingForOrders!.ownerId).toBe('p2');

        engine.applyOrder(makeWaitOrder('unit_p2', 9, 5));
        expect(engine.waitingForOrders).toBeNull();

        // --- Both on cooldown; advance enough ticks for the wait cooldown to expire ---
        // Wait cooldown is 1–3 seconds. Movement of 1 tile at 120 px/s on a 40px grid
        // completes quickly, so the cooldown should end after the 1-second minimum.
        // 1 second = 60 ticks. Add buffer for the unit update tick ordering.
        stepEngine(engine, 300);

        // --- Turn 2: One of the players should get a turn ---
        expect(engine.waitingForOrders).not.toBeNull();
        expect(engine.gameTick).toBeGreaterThan(tickBeforeP1Order);

        // The first unit processed in the loop that finishes cooldown gets the turn.
        // Since p1's unit is first in the units array, p1 should get the turn first.
        expect(engine.waitingForOrders!.ownerId).toBe('p1');

        engine.destroy();
    });

    it('tracks the onWaitingForOrders callback through the cycle', () => {
        const { engine } = createTwoPlayerEngine();

        const turnLog: WaitingForOrders[] = [];
        engine.setOnWaitingForOrders((info) => {
            turnLog.push({ ...info });
        });

        // Turn 1: p1
        stepEngine(engine, 1);
        expect(turnLog).toHaveLength(1);
        expect(turnLog[0].ownerId).toBe('p1');

        engine.applyOrder(makeWaitOrder('unit_p1', 6, 5));

        // Turn 1: p2
        stepEngine(engine, 5);
        expect(turnLog).toHaveLength(2);
        expect(turnLog[1].ownerId).toBe('p2');

        engine.applyOrder(makeWaitOrder('unit_p2', 9, 5));

        // Turn 2: p1 again
        stepEngine(engine, 300);
        expect(turnLog).toHaveLength(3);
        expect(turnLog[2].ownerId).toBe('p1');

        engine.destroy();
    });

    it('advances gameTick and gameTime between turns', () => {
        const { engine } = createTwoPlayerEngine();

        stepEngine(engine, 1);
        const tick1 = engine.gameTick;
        const time1 = engine.gameTime;

        engine.applyOrder(makeWaitOrder('unit_p1', 6, 5));
        stepEngine(engine, 5);

        const tick2 = engine.gameTick;
        const time2 = engine.gameTime;

        expect(tick2).toBeGreaterThan(tick1);
        expect(time2).toBeGreaterThan(time1);

        engine.applyOrder(makeWaitOrder('unit_p2', 9, 5));
        stepEngine(engine, 300);

        expect(engine.gameTick).toBeGreaterThan(tick2);
        expect(engine.gameTime).toBeGreaterThan(time2);

        engine.destroy();
    });

    it('snapshotIndex increments with each turn', () => {
        const { engine } = createTwoPlayerEngine();

        stepEngine(engine, 1);
        const snap1 = engine.snapshotIndex;

        engine.applyOrder(makeWaitOrder('unit_p1', 6, 5));
        stepEngine(engine, 5);
        const snap2 = engine.snapshotIndex;

        engine.applyOrder(makeWaitOrder('unit_p2', 9, 5));
        stepEngine(engine, 300);
        const snap3 = engine.snapshotIndex;

        expect(snap2).toBe(snap1 + 1);
        expect(snap3).toBe(snap2 + 1);

        engine.destroy();
    });

    it('simulates remote order delivery via queueOrder + resumeAfterOrders', () => {
        const { engine } = createTwoPlayerEngine();

        // p1's turn
        stepEngine(engine, 1);
        expect(engine.waitingForOrders!.ownerId).toBe('p1');

        // Simulate p1 submitting locally
        engine.applyOrder(makeWaitOrder('unit_p1', 6, 5));

        // p2's turn
        stepEngine(engine, 5);
        expect(engine.waitingForOrders!.ownerId).toBe('p2');

        // Simulate remote order delivery: the other client submitted for p2,
        // and we receive it via polling (queueOrder + resumeAfterOrders).
        const atTick = engine.gameTick + 1;
        engine.queueOrder(atTick, makeWaitOrder('unit_p2', 9, 5));
        engine.resumeAfterOrders();

        expect(engine.waitingForOrders).toBeNull();

        // Advance to next turn
        stepEngine(engine, 300);
        expect(engine.waitingForOrders).not.toBeNull();
        expect(engine.waitingForOrders!.ownerId).toBe('p1');

        engine.destroy();
    });

    it('handles three consecutive full cycles without errors', () => {
        const { engine, unitP1, unitP2 } = createTwoPlayerEngine();
        let p1Col = 5;
        let p2Col = 8;

        for (let cycle = 0; cycle < 3; cycle++) {
            // p1's turn
            stepEngine(engine, 300);
            expect(engine.waitingForOrders).not.toBeNull();
            expect(engine.waitingForOrders!.ownerId).toBe('p1');

            p1Col++;
            engine.applyOrder(makeWaitOrder('unit_p1', p1Col, 5));

            // p2's turn
            stepEngine(engine, 300);
            expect(engine.waitingForOrders).not.toBeNull();
            expect(engine.waitingForOrders!.ownerId).toBe('p2');

            p2Col++;
            engine.applyOrder(makeWaitOrder('unit_p2', p2Col, 5));
        }

        // After 3 full cycles, both units should still be alive and the
        // engine should be ready for the next turn.
        expect(unitP1.isAlive()).toBe(true);
        expect(unitP2.isAlive()).toBe(true);

        stepEngine(engine, 300);
        expect(engine.waitingForOrders).not.toBeNull();

        engine.destroy();
    });
});
