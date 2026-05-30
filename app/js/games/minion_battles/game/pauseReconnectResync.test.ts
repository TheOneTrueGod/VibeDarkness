/**
 * Reconnect / full resync during order pause: snapshot round-trip and pause flags stay consistent.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from './GameEngine';
import { Unit } from './units/Unit';
import { resetGameObjectIdCounter } from './GameObject';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import type { BattleOrder, SerializedGameState } from './types';

const FIXED_DT = 1 / 60;

function createTwoPlayerEngine(): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
    const startCol = 5;
    const startRow = 5;
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
        }),
    );
    return engine;
}

function advanceUntilOrderPause(engine: GameEngine, maxSteps = 24): void {
    for (let i = 0; i < maxSteps; i++) {
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
        if (engine.waitingForOrders != null) return;
    }
    throw new Error('expected waitingForOrders');
}

function makeWaitOrder(unitId: string, moveCol: number, moveRow: number): BattleOrder {
    return {
        unitId,
        abilityId: 'wait',
        targets: [],
        movePath: [{ col: moveCol, row: moveRow }],
    };
}

describe('Reconnect / resync during order pause', () => {
    it('commits deferred parallel pause, checkpoint, and tick-complete in the same fixedUpdate', () => {
        const engine = createTwoPlayerEngine();
        const checkpoints: number[] = [];
        const tickCompletes: Array<{ tick: number; paused: boolean }> = [];
        engine.setOnCheckpoint((gameTick) => {
            checkpoints.push(gameTick);
        });
        engine.setOnTickComplete((tick, _fp, paused) => {
            tickCompletes.push({ tick, paused });
        });
        advanceUntilOrderPause(engine);
        expect(checkpoints.length).toBe(1);
        expect(tickCompletes.length).toBeGreaterThan(0);
        const last = tickCompletes[tickCompletes.length - 1];
        expect(last.paused).toBe(true);
        expect(engine.waitingForOrders).not.toBeNull();
        engine.destroy();
    });

    it('does not advance gameTick when fixedUpdate runs again while paused for parallel orders', () => {
        const engine = createTwoPlayerEngine();
        advanceUntilOrderPause(engine);
        const tickAtPause = engine.gameTick;
        expect(engine.isPaused).toBe(true);
        expect(engine.waitingForOrders).not.toBeNull();

        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
        expect(engine.gameTick).toBe(tickAtPause);
    });

    it('fromJSON restores full waiter list, atTick, pause, and active waiter resolution', () => {
        const engine = createTwoPlayerEngine();
        advanceUntilOrderPause(engine);
        const tickAtPause = engine.gameTick;
        const snap = engine.toJSON() as SerializedGameState;
        expect(snap.waitingForOrders?.waiters).toHaveLength(2);
        engine.destroy();

        const restored = GameEngine.fromJSON(snap, 'p1', null);
        expect(restored.isPaused).toBe(true);
        expect(restored.waitingForOrders).not.toBeNull();
        expect(restored.gameTick).toBe(tickAtPause);
        expect(restored.waitingForOrders!.atTick).toBe(snap.waitingForOrders!.atTick);
        expect(restored.state.orderMgr.getActiveOrderWaiterForPlayer('p1')?.unitId).toBe('unit_p1');
        expect(restored.state.orderMgr.getActiveOrderWaiterForPlayer('p2')?.unitId).toBe('unit_p2');
        restored.tryResumeParallel();
        expect(restored.waitingForOrders).not.toBeNull();

        const roundTrip = GameEngine.fromJSON(restored.toJSON() as SerializedGameState, 'p2', null);
        expect(roundTrip.isPaused).toBe(true);
        expect(roundTrip.waitingForOrders?.waiters.map((w) => w.unitId).sort()).toEqual(['unit_p1', 'unit_p2']);

        roundTrip.destroy();
        restored.destroy();
    });

    it('after resync, submitting all batch orders still clears pause', () => {
        const engine = createTwoPlayerEngine();
        advanceUntilOrderPause(engine);
        const restored = GameEngine.fromJSON(engine.toJSON() as SerializedGameState, 'p1', null);
        engine.destroy();

        restored.state.orderMgr.applyOrder(makeWaitOrder('unit_p1', 6, 5));
        expect(restored.waitingForOrders).not.toBeNull();
        restored.state.orderMgr.applyOrder(makeWaitOrder('unit_p2', 9, 5));
        expect(restored.waitingForOrders).toBeNull();
        expect(restored.isPaused).toBe(false);

        restored.destroy();
    });

    it('clearDeferredOrderPauseAndAccumulator is safe after load (simulates session before start)', () => {
        const engine = createTwoPlayerEngine();
        advanceUntilOrderPause(engine);
        const restored = GameEngine.fromJSON(engine.toJSON() as SerializedGameState, 'p1', null);
        engine.destroy();

        restored.clearDeferredOrderPauseAndAccumulator();
        expect(restored.waitingForOrders).not.toBeNull();
        expect(restored.isPaused).toBe(true);

        restored.destroy();
    });

    it('fromJSON rewrites parallel waiter orders queued at gameTick to waitingForOrders.atTick', () => {
        const engine = createTwoPlayerEngine();
        advanceUntilOrderPause(engine);
        const snap = engine.toJSON() as SerializedGameState;
        const atTick = snap.waitingForOrders!.atTick;
        const tickAtPause = snap.gameTick;
        expect(atTick).toBe(tickAtPause + 1);
        snap.orders = [
            { gameTick: tickAtPause, order: makeWaitOrder('unit_p1', 6, 5) },
            { gameTick: tickAtPause, order: makeWaitOrder('unit_p2', 9, 5) },
        ];
        engine.destroy();

        const restored = GameEngine.fromJSON(snap, 'p1', null);
        expect(restored.pendingOrders.map((o) => o.gameTick)).toEqual([atTick, atTick]);
        expect(restored.waitingForOrders).toBeNull();
        expect(restored.isPaused).toBe(false);
        restored.destroy();
    });

    it('fromJSON merges missing parallel waiters when checkpoint lists only units that already queued', () => {
        const engine = createTwoPlayerEngine();
        advanceUntilOrderPause(engine);
        const snap = engine.toJSON() as SerializedGameState;
        const atTick = snap.waitingForOrders!.atTick;
        snap.orders = [
            {
                gameTick: atTick,
                order: makeWaitOrder('unit_p1', 6, 5),
            },
        ];
        snap.waitingForOrders = {
            waiters: [{ unitId: 'unit_p1', ownerId: 'p1' }],
            atTick,
        };
        engine.destroy();

        const restored = GameEngine.fromJSON(snap, 'p1', null);
        expect(restored.isPaused).toBe(true);
        expect(restored.waitingForOrders).not.toBeNull();
        expect(restored.waitingForOrders!.waiters.map((w) => w.unitId).sort()).toEqual(['unit_p1', 'unit_p2']);
        expect(restored.state.orderMgr.getActiveOrderWaiterForPlayer('p2')?.unitId).toBe('unit_p2');
        restored.destroy();
    });
});
