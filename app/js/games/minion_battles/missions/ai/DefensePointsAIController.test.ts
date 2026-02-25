/**
 * Tests that each step of DefensePointsAIController executes in order:
 * 1. Channeling + enemy in perception/LOS → cancel channel, set aiTargetUnitId, wait.
 * 2. No DefendPoints → stand still, clear state, wait.
 * 3. No defensePointTarget or dead → pick closest alive DefendPoint, store on unit.
 * 4. No path or gameTick % retrigger === 0 → recalc path to defensePointTarget.
 * 5. Hostiles in perception + LOS → set aiTargetUnitId, move to range, use ability or wait.
 * 6. No hostiles → clear aiTargetUnitId; if within 50 of DP and has channel_darkness, use it; else wait.
 */
import { describe, it, expect } from 'vitest';
import { Unit } from '../../objects/Unit';
import type { AIContext } from './types';
import type { SpecialTile } from '../../objects/SpecialTile';
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
    defensePointTarget: string | undefined;
    aiTargetUnitId: string | undefined;
    pathfindingRetriggerOffset: number;
    movement: { path: { col: number; row: number }[]; targetUnitId: string | undefined; pathfindingTick: number } | null;
    abilities: string[];
    activeAbilities: { abilityId: string; startTime: number; targets: unknown[] }[];
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
        abilities: overrides.abilities ?? ['0003'],
        aiSettings: { minRange: 30, maxRange: 80 },
        radius: 10,
    });
    if (overrides.defensePointTarget !== undefined) unit.defensePointTarget = overrides.defensePointTarget;
    if (overrides.aiTargetUnitId !== undefined) unit.aiTargetUnitId = overrides.aiTargetUnitId;
    if (overrides.pathfindingRetriggerOffset !== undefined) unit.pathfindingRetriggerOffset = overrides.pathfindingRetriggerOffset;
    if (overrides.movement !== undefined) unit.movement = overrides.movement;
    if (overrides.activeAbilities !== undefined) unit.activeAbilities = overrides.activeAbilities as Unit['activeAbilities'];
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
    return { id, defId: 'DefendPoint', col, row, hp, maxHp: 5 };
}

function createMockContext(options: {
    aliveDefendPoints: SpecialTile[];
    units: Unit[];
    terrainManager?: TerrainManager | null;
    hasLineOfSight?: boolean;
    gameTick?: number;
}): { context: AIContext; orders: BattleOrder[]; turnEnds: string[] } {
    const orders: BattleOrder[] = [];
    const turnEnds: string[] = [];
    const hasLineOfSight = options.hasLineOfSight ?? true;
    const gameTick = options.gameTick ?? GAME_TICK;

    const context: AIContext = {
        gameTick,
        getUnit: (id) => options.units.find((u) => u.id === id),
        getUnits: () => options.units,
        getSpecialTiles: () => options.aliveDefendPoints,
        getAliveDefendPoints: () => options.aliveDefendPoints.filter((t) => t.hp > 0),
        terrainManager: options.terrainManager ?? null,
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
        cancelActiveAbility: (unitId, abilityId) => {
            const u = options.units.find((u) => u.id === unitId);
            if (u) u.activeAbilities = u.activeAbilities.filter((a) => a.abilityId !== abilityId);
        },
    };
    return { context, orders, turnEnds };
}

describe('DefensePointsAIController', () => {
    describe('step 1: no DefendPoints', () => {
        it('clears movement and AI state and queues wait when no DefendPoints are alive', () => {
            const unit = createAIUnit({
                defensePointTarget: 'dp_1',
                aiTargetUnitId: 'player_1',
                movement: { path: [{ col: 5, row: 5 }], targetUnitId: undefined, pathfindingTick: 0 },
            });
            const { context, orders, turnEnds } = createMockContext({
                aliveDefendPoints: [],
                units: [unit],
            });

            DefensePointsAIController.executeTurn(unit, context);

            expect(unit.movement).toBeNull();
            expect(unit.defensePointTarget).toBeUndefined();
            expect(unit.aiTargetUnitId).toBeUndefined();
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

            expect(unit.defensePointTarget).toBe('dp_near');
            expect(orders).toHaveLength(1);
            expect(turnEnds).toHaveLength(1);
        });

        it('reassigns defensePointTarget when current target is dead (hp 0)', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const unit = createAIUnit({ x: 200, y: 400, defensePointTarget: 'dp_dead' });
            const dpDead = createDefendPoint('dp_dead', 3, 3, 0);
            const dpAlive = createDefendPoint('dp_alive', 5, 10, 5);
            const { context } = createMockContext({
                aliveDefendPoints: [dpDead, dpAlive],
                units: [unit],
                terrainManager: tm,
                gameTick: 50,
            });

            DefensePointsAIController.executeTurn(unit, context);

            expect(unit.defensePointTarget).toBe('dp_alive');
        });
    });

    describe('step 3: recalc path when no path or gameTick % retrigger === 0', () => {
        it('sets movement path when unit has no path and DefendPoint exists', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const unit = createAIUnit({
                x: 40,
                y: 40,
                defensePointTarget: 'dp_1',
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
                defensePointTarget: 'dp_1',
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
                defensePointTarget: 'dp_1',
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

            expect(aiUnit.aiTargetUnitId).toBe('player_1');
            expect(orders.some((o) => o.abilityId !== 'wait')).toBe(true);
            expect(orders.some((o) => o.abilityId === '0003')).toBe(true);
        });

        it('sets aiTargetUnitId and queues wait when hostile in perception but no ability in range', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const aiUnit = createAIUnit({
                x: 400,
                y: 400,
                defensePointTarget: 'dp_1',
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

            expect(aiUnit.aiTargetUnitId).toBe('player_1');
            expect(orders).toHaveLength(1);
            expect(orders[0].abilityId).toBe('wait');
        });
    });

    describe('step 5: no hostiles in perception or LOS', () => {
        it('clears aiTargetUnitId and queues wait when no hostiles in perception', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const aiUnit = createAIUnit({
                x: 400,
                y: 400,
                defensePointTarget: 'dp_1',
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

            expect(aiUnit.aiTargetUnitId).toBeUndefined();
            expect(orders).toHaveLength(1);
            expect(orders[0].abilityId).toBe('wait');
        });

        it('queues wait when hostile in range but no LOS (hasLineOfSight false)', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const aiUnit = createAIUnit({
                x: 400,
                y: 400,
                defensePointTarget: 'dp_1',
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

            expect(aiUnit.aiTargetUnitId).toBeUndefined();
            expect(orders[0].abilityId).toBe('wait');
        });
    });

    describe('step 6: Channel Darkness when within 50 of DefendPoint and no enemies', () => {
        it('queues ChannelDarkness with specialTileId when unit is within 50 of target DP and has the ability', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            // DP at (5, 10) -> world center (220, 420). Unit at (220, 420) is distance 0, within 50.
            const aiUnit = createAIUnit({
                x: 220,
                y: 420,
                defensePointTarget: 'dp_1',
                abilities: ['0003', 'channel_darkness'],
            });
            aiUnit.cooldownRemaining = 0;
            const dp = createDefendPoint('dp_1', 5, 10, 5);
            const { context, orders } = createMockContext({
                aliveDefendPoints: [dp],
                units: [aiUnit],
                terrainManager: tm,
            });

            DefensePointsAIController.executeTurn(aiUnit, context);

            expect(orders).toHaveLength(1);
            expect(orders[0].abilityId).toBe('channel_darkness');
            expect(orders[0].targets).toEqual([{ type: 'specialTile', specialTileId: 'dp_1' }]);
        });

        it('queues wait when unit has no channel_darkness ability (even if within 50 of DP)', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const aiUnit = createAIUnit({
                x: 220,
                y: 420,
                defensePointTarget: 'dp_1',
                abilities: ['0003'],
            });
            const dp = createDefendPoint('dp_1', 5, 10, 5);
            const { context, orders } = createMockContext({
                aliveDefendPoints: [dp],
                units: [aiUnit],
                terrainManager: tm,
            });

            DefensePointsAIController.executeTurn(aiUnit, context);

            expect(orders[0].abilityId).toBe('wait');
        });

        it('queues wait when unit is not within 50 of DefendPoint', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const aiUnit = createAIUnit({
                x: 40,
                y: 40,
                defensePointTarget: 'dp_1',
                abilities: ['0003', 'channel_darkness'],
            });
            const dp = createDefendPoint('dp_1', 5, 10, 5);
            const { context, orders } = createMockContext({
                aliveDefendPoints: [dp],
                units: [aiUnit],
                terrainManager: tm,
            });

            DefensePointsAIController.executeTurn(aiUnit, context);

            expect(orders[0].abilityId).toBe('wait');
        });
    });

    describe('cancel Channel Darkness when enemy in perception + LOS', () => {
        it('cancels channel_darkness and sets aiTargetUnitId when unit is channeling and sees an enemy', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const aiUnit = createAIUnit({
                x: 220,
                y: 420,
                defensePointTarget: 'dp_1',
                abilities: ['0003', 'channel_darkness'],
                activeAbilities: [{ abilityId: 'channel_darkness', startTime: 0, targets: [{ type: 'specialTile', specialTileId: 'dp_1' }] }],
            });
            const playerUnit = createPlayerUnit('player_1', 250, 420);
            const dp = createDefendPoint('dp_1', 5, 10, 5);
            const { context, orders } = createMockContext({
                aliveDefendPoints: [dp],
                units: [aiUnit, playerUnit],
                terrainManager: tm,
                hasLineOfSight: true,
            });

            DefensePointsAIController.executeTurn(aiUnit, context);

            expect(aiUnit.activeAbilities.some((a) => a.abilityId === 'channel_darkness')).toBe(false);
            expect(aiUnit.aiTargetUnitId).toBe('player_1');
            expect(orders[0].abilityId).toBe('wait');
        });
    });

    describe('order of steps', () => {
        it('does not set defensePointTarget or path when no DefendPoints (step 1 wins)', () => {
            const unit = createAIUnit({ defensePointTarget: undefined });
            const { context } = createMockContext({
                aliveDefendPoints: [],
                units: [unit],
            });

            DefensePointsAIController.executeTurn(unit, context);

            expect(unit.defensePointTarget).toBeUndefined();
            expect(unit.movement).toBeNull();
        });

        it('sets defensePointTarget first then path (step 2 before step 3); player far so no combat target', () => {
            const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
            const tm = new TerrainManager(grid);
            const aiUnit = createAIUnit({
                x: 40,
                y: 40,
                defensePointTarget: undefined,
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

            expect(aiUnit.defensePointTarget).toBe('dp_1');
            expect(orders).toHaveLength(1);
            expect(orders[0].abilityId).toBe('wait');
        });
    });
});
