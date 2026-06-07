/**
 * Mid-ability conditional cancel: pause on interval exit, wait resumes cast, coop cancel suppressed.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from './GameEngine';
import { Unit } from './units/Unit';
import { resetGameObjectIdCounter } from './GameObject';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainType } from '../terrain/TerrainType';
import { initializeAbilityRuntimeForUnit } from '../abilities/abilityUses';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import { runScenarioHeadless } from '../testing/runner/SimulationRunner';
import { earthCoreDiggingClawsScenario } from '../testing/scenarios/abilities/earthCoreScenarios';

type EnginePrivatePauseTest = {
    deferredOrderPause: {
        waiters: import('./types').OrderWaiter[];
        naturalCompletionUnitIds: readonly string[];
        conditionalCancelContext?: {
            unitId: string;
            activeAbilityId: string;
            abilityTagFilter?: readonly string[];
        };
    } | null;
    commitDeferredOrderPauseAfterCompletedTick(): boolean;
    waitingForOrders: import('./types').WaitingForOrders | null;
};

describe('conditional cancel', () => {
    it('toJSON serializes conditionalCancelContext on waitingForOrders', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        engine.waitingForOrders = {
            waiters: [{ unitId: 'unit_1', ownerId: 'p1' }],
            atTick: 12,
            conditionalCancelContext: {
                unitId: 'unit_1',
                activeAbilityId: '0534',
                abilityTagFilter: ['Entombed'],
            },
        };

        const json = engine.toJSON();
        expect(json.waitingForOrders).toEqual({
            waiters: [{ unitId: 'unit_1', ownerId: 'p1' }],
            atTick: 12,
            conditionalCancelContext: {
                unitId: 'unit_1',
                activeAbilityId: '0534',
                abilityTagFilter: ['Entombed'],
            },
        });

        engine.destroy();
    });

    it('suppresses coop cancel when conditionalCancelContext is present', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
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
            abilities: ['0534'],
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
                abilityId: '0534',
                startTime: engine.gameTime - 0.39,
                targets: [{ type: 'pixel', position: { x: unitP1.x + 40, y: unitP1.y } }],
            },
        ];
        unitP2.activeAbilities = [
            {
                abilityId: '0533',
                startTime: engine.gameTime - 1.0,
                targets: [{ type: 'pixel', position: { x: unitP2.x + 40, y: unitP2.y } }],
            },
        ];

        const eng = engine as unknown as EnginePrivatePauseTest;
        eng.deferredOrderPause = {
            waiters: [{ unitId: 'unit_p1', ownerId: 'p1' }],
            naturalCompletionUnitIds: ['unit_p1'],
            conditionalCancelContext: {
                unitId: 'unit_p1',
                activeAbilityId: '0534',
            },
        };

        expect(eng.commitDeferredOrderPauseAfterCompletedTick()).toBe(true);
        expect(unitP1.activeAbilities.length).toBe(1);
        expect(unitP2.activeAbilities.length).toBe(1);
        expect(engine.waitingForOrders?.conditionalCancelContext?.unitId).toBe('unit_p1');
        expect(engine.waitingForOrders?.teamworkCancelledOwnerIds).toBeUndefined();

        engine.destroy();
    });

    it('wait order resumes a paused cast without turn wait lockout', () => {
        resetGameObjectIdCounter(1);
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 10, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
        for (let col = 4; col <= 5; col++) {
            for (let row = 2; row <= 7; row++) {
                engine.terrainManager!.grid.set(col, row, TerrainType.Rock);
            }
        }
        placePlayerAndDummy(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            playerWorld: { x: 2 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 },
            dummyWorld: { x: 4 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 },
            abilities: ['0534'],
        });

        const player = engine.getLocalPlayerUnit()!;
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: '0534',
            targets: [{ type: 'pixel', position: { x: 5 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 } }],
        });

        let pausedWithContext = false;
        for (let i = 0; i < 120; i++) {
            if (engine.waitingForOrders?.conditionalCancelContext) {
                pausedWithContext = true;
                engine.state.orderMgr.applyOrder({ unitId: player.id, abilityId: 'wait', targets: [] });
                break;
            }
            engine.stepSimulationFixedTicks(1);
        }

        expect(pausedWithContext).toBe(true);
        expect(player.activeAbilities.some((a) => a.abilityId === '0534')).toBe(true);
        expect(player.activeAbilities[0]?.conditionalCancelPaused).toBe(false);

        for (let i = 0; i < 180; i++) {
            engine.stepSimulationFixedTicks(1);
            if (player.activeAbilities.length === 0) break;
        }

        expect(player.isInWaitLockout()).toBe(false);
        expect(engine.terrainManager!.isPassable(player.x, player.y)).toBe(true);

        engine.destroy();
    });

    it('rejects ability orders that fail the tag filter during conditional cancel', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        const unit = new Unit({
            id: 'unit_p1',
            x: 100,
            y: 100,
            hp: 100,
            maxHp: 100,
            speed: 120,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            portraitId: 'warrior',
            name: 'P1',
            abilities: ['0534', '0120'],
        });
        engine.addUnit(unit);
        initializeAbilityRuntimeForUnit(unit);
        unit.activeAbilities = [
            {
                abilityId: '0534',
                startTime: 0,
                targets: [{ type: 'pixel', position: { x: 140, y: 100 } }],
                conditionalCancelPaused: true,
            },
        ];

        engine.gameTick = 5;
        engine.waitingForOrders = {
            waiters: [{ unitId: 'unit_p1', ownerId: 'p1' }],
            atTick: 6,
            conditionalCancelContext: {
                unitId: 'unit_p1',
                activeAbilityId: '0534',
                abilityTagFilter: ['Entombed'],
            },
        };
        engine.isPaused = true;

        engine.state.orderMgr.applyOrder({
            unitId: 'unit_p1',
            abilityId: '0120',
            targets: [{ type: 'pixel', position: { x: 140, y: 100 } }],
        });

        expect(engine.state.orderMgr.hasPendingOrderForUnit('unit_p1', 6)).toBe(false);
        expect(unit.activeAbilities.some((a) => a.abilityId === '0534')).toBe(true);

        engine.destroy();
    });

    it('earth core digging claws scenario still passes with auto-wait resume', () => {
        const result = runScenarioHeadless(earthCoreDiggingClawsScenario);
        expect(result.passed, result.message).toBe(true);
    });
});
