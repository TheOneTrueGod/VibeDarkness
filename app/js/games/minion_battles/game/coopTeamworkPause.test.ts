/**
 * Coop cooldown sync: checkpoint shape omits ephemeral teamwork ids; deferred pause commit
 * cancels same-team allies in coop tail and merges newly idle units into the waiter batch.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from './GameEngine';
import { Unit } from './units/Unit';
import { resetGameObjectIdCounter } from './GameObject';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { initializeAbilityRuntimeForUnit } from '../abilities/abilityUses';

const FIXED_DT = 1 / 60;

type EngineWithPrivatePause = GameEngine & {
    deferredOrderPause: { waiters: import('./types').OrderWaiter[]; naturalCompletionUnitIds: readonly string[] } | null;
    fixedUpdate(dt: number): void;
};

describe('Coop cooldown teamwork pause', () => {
    it('toJSON omits teamworkCancelledOwnerIds from waitingForOrders', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1' });
        engine.waitingForOrders = {
            waiters: [{ unitId: 'a', ownerId: 'p1' }],
            atTick: 3,
            teamworkCancelledOwnerIds: ['p1'],
        };
        const json = engine.toJSON();
        expect(json.waitingForOrders).toEqual({ waiters: [{ unitId: 'a', ownerId: 'p1' }], atTick: 3 });
        engine.destroy();
    });

    it('committing deferred pause cancels ally coop tail, expands waiters, and sets teamwork owners', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1' });
        const col = 6;
        const row = 6;
        const unitP1 = new Unit({
            id: 'unit_p1',
            x: col * CELL_SIZE + CELL_SIZE / 2,
            y: row * CELL_SIZE + CELL_SIZE / 2,
            hp: 100,
            maxHp: 100,
            speed: 120,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            portraitId: 'warrior',
            name: 'P1',
            abilities: ['0102'],
        });
        const unitP2 = new Unit({
            id: 'unit_p2',
            x: (col + 2) * CELL_SIZE + CELL_SIZE / 2,
            y: row * CELL_SIZE + CELL_SIZE / 2,
            hp: 100,
            maxHp: 100,
            speed: 120,
            teamId: 'player',
            ownerId: 'p2',
            characterId: 'player',
            portraitId: 'ranger',
            name: 'P2',
            abilities: ['0533'],
        });
        engine.addUnit(unitP1);
        engine.addUnit(unitP2);
        initializeAbilityRuntimeForUnit(unitP1);
        initializeAbilityRuntimeForUnit(unitP2);

        engine.gameTick = 10;
        engine.gameTime = 20;
        unitP1.activeAbilities = [
            {
                abilityId: '0102',
                startTime: engine.gameTime - 1.0,
                targets: [{ type: 'pixel', position: { x: unitP1.x + 40, y: unitP1.y } }],
            },
        ];

        const eng = engine as unknown as EngineWithPrivatePause;
        eng.deferredOrderPause = {
            waiters: [{ unitId: 'unit_p2', ownerId: 'p2' }],
            naturalCompletionUnitIds: ['unit_p2'],
        };

        eng.fixedUpdate(FIXED_DT);

        expect(unitP1.activeAbilities.length).toBe(0);
        const w = engine.waitingForOrders!;
        expect(w.waiters.map((x) => x.unitId).sort()).toEqual(['unit_p1', 'unit_p2']);
        expect(w.teamworkCancelledOwnerIds).toEqual(['p1']);

        engine.destroy();
    });
});
