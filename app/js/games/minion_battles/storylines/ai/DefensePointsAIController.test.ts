/**
 * Tests that each step of DefensePointsAIController executes in order:
 * 1. No DefendPoints → stand still, clear state, wait.
 * 2. No defensePointTarget or dead → pick closest alive DefendPoint, store on unit.
 * 3. No path or gameTick % retrigger === 0 → recalc path to defensePointTarget.
 * 4. Hostiles in perception + LOS → set aiTargetUnitId, move to range, use ability or wait.
 * 5. No hostiles → clear aiTargetUnitId, wait.
 */
import { describe, it, expect } from 'vitest';
import { Unit } from '../../objects/Unit';
import type { AIContext } from './types';
import { isTileDefendPoint, type SpecialTile } from '../../objects/SpecialTile';
import type { BattleOrder } from '../../engine/types';
import { DefensePointsAIController } from './DefensePointsAIController';
import { TerrainGrid } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainType } from '../../terrain/TerrainType';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../../engine/GameEngine';

const GAME_TICK = 100;

function createAIUnit(overrides: Partial<{
    id: string;
    x: number;
    y: number;
    defensePointTargetId: string | undefined;
    aiTargetUnitId: string | undefined;
    pathfindingRetriggerOffset: number;
    movement: { path: { col: number; row: number }[]; targetUnitId: string | undefined; pathfindingTick: number } | null;
}> = {}) {
    const unit = new Unit({
        id: overrides.id ?? 'ai_1',
        x: overrides.x ?? 400,
        y: overrides.y ?? 400,
        hp: 12,
        maxHp: 12,
        speed: 100,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'dark_wolf',
        name: 'Wolf',
        abilities: ['0003'],
        aiSettings: { minRange: 30, maxRange: 80 },
        radius: 10,
    });
    if (overrides.defensePointTargetId !== undefined) {
        unit.aiContext.defensePointTargetId = overrides.defensePointTargetId;
    }
    if (overrides.aiTargetUnitId !== undefined) {
        unit.aiContext.aiTargetUnitId = overrides.aiTargetUnitId;
    }
    if (overrides.pathfindingRetriggerOffset !== undefined) unit.pathfindingRetriggerOffset = overrides.pathfindingRetriggerOffset;
    if (overrides.movement !== undefined) unit.movement = overrides.movement;
    return unit;
}

function createPlayerUnit(id: string, x: number, y: number): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 50,
        maxHp: 50,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'warrior',
        name: 'Player',
        abilities: [],
        radius: 20,
    });
}

function createDefendPoint(id: string, col: number, row: number, hp: number): SpecialTile {
    return { id, defId: 'Campfire', col, row, hp, maxHp: 5, defendPoint: true };
}

function createLitDefendPoint(id: string, col: number, row: number, hp: number, lightAmount: number): SpecialTile {
    return {
        id,
        defId: 'Campfire',
        col,
        row,
        hp,
        maxHp: 5,
        defendPoint: true,
        emitsLight: { lightAmount, radius: 8 },
    };
}

function createMockContext(options: {
    aliveDefendPoints: SpecialTile[];
    units: Unit[];
    terrainManager?: TerrainManager | null;
    hasLineOfSight?: boolean;
    gameTick?: number;
    gameTime?: number;
}): { context: AIContext; orders: BattleOrder[]; turnEnds: string[] } {
    const orders: BattleOrder[] = [];
    const turnEnds: string[] = [];
    const hasLineOfSight = options.hasLineOfSight ?? true;
    const gameTick = options.gameTick ?? GAME_TICK;
    const gameTime = options.gameTime ?? 0;

    const context: AIContext = {
        gameTick,
        gameTime,
        getUnit: (id) => options.units.find((u) => u.id === id),
        getUnits: () => options.units,
        getSpecialTiles: () => options.aliveDefendPoints,
        getAliveDefendPoints: () => options.aliveDefendPoints.filter(isTileDefendPoint),
        terrainManager: options.terrainManager ?? null,
        findGridPathForUnit: (_, fromCol, fromRow, toCol, toRow) =>
            options.terrainManager?.findGridPath(fromCol, fromRow, toCol, toRow) ?? null,
        queueOrder: (atTick, order) => {
            orders.push(order);
        },
        emitTurnEnd: (unitId) => {
            turnEnds.push(unitId);
        },
        generateRandomInteger: (min, max) => min,
        WORLD_WIDTH,
        WORLD_HEIGHT,
        hasLineOfSight: () => hasLineOfSight,
        cancelActiveAbility: () => {},
    };
    return { context, orders, turnEnds };
}

describe('DefensePointsAIController', () => {
    describe('step 1: no DefendPoints (no DefendPoints → wait)', () => {
        it('clears movement and AI state and queues wait when no DefendPoints are alive', () => {
            const unit = createAIUnit({
                defensePointTargetId: 'dp_1',
                aiTargetUnitId: 'player_1',
                movement: { path: [{ col: 5, row: 5 }], targetUnitId: undefined, pathfindingTick: 0 },
            });
            const { context, orders, turnEnds } = createMockContext({
                aliveDefendPoints: [],
                units: [unit],
            });

            DefensePointsAIController.executeTurn(unit, context);

            expect(unit.movement).toBeNull();
            expect(unit.aiContext.defensePointTargetId).toBeUndefined();
            expect(unit.aiContext.aiTargetUnitId).toBeUndefined();
            expect(orders).toHaveLength(1);
            expect(orders[0].abilityId).toBe('wait');
            expect(orders[0].unitId).toBe(unit.id);
            expect(turnEnds).toEqual([unit.id]);
        });
    });

    describe('step 2: pick closest DefendPoint when missing or dead', () => {
        it('sets defensePointTarget to closest alive DefendPoint when unit has none', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const unit = createAIUnit({ x: 200, y: 400 }); // col 5, row 10
            const dpNear = createDefendPoint('dp_near', 5, 10, 5);  // 200, 400
            const dpFar = createDefendPoint('dp_far', 20, 10, 5);   // 820, 400
            const { context, orders, turnEnds } = createMockContext({
                aliveDefendPoints: [dpFar, dpNear],
                units: [unit],
                terrainManager: tm,
                gameTick: 50,
            });

            DefensePointsAIController.executeTurn(unit, context);

            expect(unit.aiContext.defensePointTargetId).toBe('dp_near');
            expect(orders).toHaveLength(1);
            expect(turnEnds).toHaveLength(1);
        });

        it('reassigns defensePointTarget when current target is dead (hp 0)', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const unit = createAIUnit({ x: 200, y: 400, defensePointTargetId: 'dp_dead' });
            const dpDead = createDefendPoint('dp_dead', 3, 3, 0);
            const dpAlive = createDefendPoint('dp_alive', 5, 10, 5);
            const { context } = createMockContext({
                aliveDefendPoints: [dpDead, dpAlive],
                units: [unit],
                terrainManager: tm,
                gameTick: 50,
            });

            DefensePointsAIController.executeTurn(unit, context);

            expect(unit.aiContext.defensePointTargetId).toBe('dp_alive');
        });

        it('reassigns defensePointTarget when current target emits 0 light', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const unit = createAIUnit({ x: 200, y: 400, defensePointTargetId: 'dp_dead_light' });
            const dpDeadLight = createLitDefendPoint('dp_dead_light', 3, 3, 5, 0);
            const dpAlive = createLitDefendPoint('dp_alive', 5, 10, 5, 10);
            const { context } = createMockContext({
                aliveDefendPoints: [dpDeadLight, dpAlive],
                units: [unit],
                terrainManager: tm,
                gameTick: 50,
            });

            DefensePointsAIController.executeTurn(unit, context);

            expect(unit.aiContext.defensePointTargetId).toBe('dp_alive');
        });
    });

    describe('step 3: recalc path when no path or retrigger', () => {
        it('sets movement path when unit has no path and DefendPoint exists', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const unit = createAIUnit({
                x: 40,
                y: 40,
                defensePointTargetId: 'dp_1',
                movement: null,
            });
            const dp = createDefendPoint('dp_1', 5, 10, 5);
            const { context } = createMockContext({
                aliveDefendPoints: [dp],
                units: [unit],
                terrainManager: tm,
                gameTick: 50,
            });

            DefensePointsAIController.executeTurn(unit, context);

            expect(unit.movement).not.toBeNull();
            expect(unit.movement!.path.length).toBeGreaterThan(0);
            expect(unit.movement!.pathfindingTick).toBe(50);
        });

        it('recalculates path when gameTick % pathfindingRetriggerOffset === 0', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const unit = createAIUnit({
                x: 40,
                y: 40,
                defensePointTargetId: 'dp_1',
                pathfindingRetriggerOffset: 50,
                movement: { path: [{ col: 1, row: 1 }], targetUnitId: undefined, pathfindingTick: 0 },
            });
            const dp = createDefendPoint('dp_1', 5, 10, 5);
            const { context } = createMockContext({
                aliveDefendPoints: [dp],
                units: [unit],
                terrainManager: tm,
                gameTick: 100,
            });

            DefensePointsAIController.executeTurn(unit, context);

            expect(unit.movement).not.toBeNull();
            expect(unit.movement!.pathfindingTick).toBe(100);
        });
    });

    describe('step 4: hostiles in perception + LOS', () => {
        it('sets aiTargetUnitId to closest hostile in perception with LOS and queues ability when in range', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const aiUnit = createAIUnit({
                x: 400,
                y: 400,
                defensePointTargetId: 'dp_1',
                movement: null,
            });
            const playerUnit = createPlayerUnit('player_1', 430, 400); // within 80 px (maxRange)
            const dp = createDefendPoint('dp_1', 2, 2, 5);
            const { context, orders } = createMockContext({
                aliveDefendPoints: [dp],
                units: [aiUnit, playerUnit],
                terrainManager: tm,
                hasLineOfSight: true,
            });

            DefensePointsAIController.executeTurn(aiUnit, context);

            expect(aiUnit.aiContext.aiTargetUnitId).toBe('player_1');
            expect(orders.some((o) => o.abilityId !== 'wait')).toBe(true);
            expect(orders.some((o) => o.abilityId === '0003')).toBe(true);
        });

        it('sets aiTargetUnitId and does not queue wait when hostile in perception but no ability in range (keeps chasing)', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const aiUnit = createAIUnit({
                x: 400,
                y: 400,
                defensePointTargetId: 'dp_1',
            });
            const playerUnit = createPlayerUnit('player_1', 600, 400); // > 80 px, but within perception (300)
            const dp = createDefendPoint('dp_1', 2, 2, 5);
            const { context, orders } = createMockContext({
                aliveDefendPoints: [dp],
                units: [aiUnit, playerUnit],
                terrainManager: tm,
                hasLineOfSight: true,
            });

            DefensePointsAIController.executeTurn(aiUnit, context);

            expect(aiUnit.aiContext.aiTargetUnitId).toBe('player_1');
            // Controller does not queue wait here so it can run again next frame and keep chasing.
            expect(orders).toHaveLength(0);
        });
    });

    describe('step 5: no hostiles → clear target, wait', () => {
        it('clears aiTargetUnitId and queues wait when no hostiles in perception', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const aiUnit = createAIUnit({
                x: 400,
                y: 400,
                defensePointTargetId: 'dp_1',
                aiTargetUnitId: 'player_1',
            });
            const playerUnit = createPlayerUnit('player_1', 50, 50); // far, outside perception 300
            const dp = createDefendPoint('dp_1', 10, 10, 5);
            const { context, orders } = createMockContext({
                aliveDefendPoints: [dp],
                units: [aiUnit, playerUnit],
                terrainManager: tm,
                hasLineOfSight: true,
            });

            DefensePointsAIController.executeTurn(aiUnit, context);

            expect(aiUnit.aiContext.aiTargetUnitId).toBeUndefined();
            expect(orders).toHaveLength(1);
            expect(orders[0].abilityId).toBe('wait');
        });

        it('queues wait when hostile in range but no LOS (hasLineOfSight false)', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const aiUnit = createAIUnit({
                x: 400,
                y: 400,
                defensePointTargetId: 'dp_1',
            });
            const playerUnit = createPlayerUnit('player_1', 430, 400);
            const dp = createDefendPoint('dp_1', 2, 2, 5);
            const { context, orders } = createMockContext({
                aliveDefendPoints: [dp],
                units: [aiUnit, playerUnit],
                terrainManager: tm,
                hasLineOfSight: false,
            });

            DefensePointsAIController.executeTurn(aiUnit, context);

            expect(aiUnit.aiContext.aiTargetUnitId).toBeUndefined();
            expect(orders[0].abilityId).toBe('wait');
        });
    });

    describe('order of steps', () => {
        it('does not set defensePointTarget or path when no DefendPoints (step 1 wins)', () => {
            const unit = createAIUnit({ defensePointTargetId: undefined });
            const { context } = createMockContext({
                aliveDefendPoints: [],
                units: [unit],
            });

            DefensePointsAIController.executeTurn(unit, context);

            expect(unit.aiContext.defensePointTargetId).toBeUndefined();
            expect(unit.movement).toBeNull();
        });

        it('sets defensePointTarget first then path (step 2 before step 3); player far so no combat target', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const aiUnit = createAIUnit({
                x: 40,
                y: 40,
                defensePointTargetId: undefined,
                movement: null,
            });
            const playerUnit = createPlayerUnit('player_1', 100, 100);
            const dp = createDefendPoint('dp_1', 5, 10, 5);
            const { context, orders } = createMockContext({
                aliveDefendPoints: [dp],
                units: [aiUnit, playerUnit],
                terrainManager: tm,
            });

            DefensePointsAIController.executeTurn(aiUnit, context);

            expect(aiUnit.aiContext.defensePointTargetId).toBe('dp_1');
            expect(orders).toHaveLength(1);
            expect(orders[0].abilityId).toBe('wait');
        });
    });
});
