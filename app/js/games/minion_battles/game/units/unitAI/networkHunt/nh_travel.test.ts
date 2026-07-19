/**
 * Tests for networkHunt nh_travel destinations: invincible enemy structures still attract march
 * hops, and empty nest-tagged network nodes are used when no structure maps onto the graph.
 */
import { describe, it, expect } from 'vitest';
import { Unit } from '../../Unit';
import type { AIContext } from '../types';
import type { NetworkHuntAITreeContext } from './context';
import type { BattleOrder } from '../../../types';
import { runUnitAI, NETWORK_HUNT_AI_TREE } from '../index';
import { TerrainGrid, CELL_SIZE } from '../../../../terrain/TerrainGrid';
import { TerrainManager } from '../../../../terrain/TerrainManager';
import { TerrainType } from '../../../../terrain/TerrainType';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../../../GameEngine';
import { MapNetworkManager } from '../../../managers/mapNetwork/MapNetworkManager';
import type { ResolvedMapNetwork } from '../../../managers/mapNetwork/types';
import { UnitTag } from '../../unitTag';
import { LANTERNITE_NEST_CHARACTER_ID } from '../../../lanternite/lanternitePulse';
import { SWARM_NEST_CHARACTER_ID } from '../../../lanternite/swarmNestTick';
import { findEnemyStructures, findEnemyStructuresForTravel } from '../utils';

/** Linear nest chain: swarm home a → empty middle b → lanternite site c. */
const NETWORK: ResolvedMapNetwork = {
    nodes: [
        { id: 'nest_a', x: 100, y: 100, radius: 40, tags: ['nest'], segmentId: 'seg1' },
        { id: 'nest_b', x: 300, y: 100, radius: 40, tags: ['nest'], segmentId: 'seg1' },
        { id: 'nest_c', x: 500, y: 100, radius: 40, tags: ['nest'], segmentId: 'seg1' },
    ],
    edges: [
        ['nest_a', 'nest_b'],
        ['nest_b', 'nest_c'],
    ],
};

function makeMapNetwork(): MapNetworkManager {
    const mgr = new MapNetworkManager();
    mgr.loadFromSegments(NETWORK);
    return mgr;
}

function makeTerrain(): TerrainManager {
    const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
    return new TerrainManager(grid);
}

function createHunter(id: string, x: number, y: number): Unit {
    const unit = new Unit({
        id,
        x,
        y,
        hp: 12,
        maxHp: 12,
        speed: 100,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'dark_wolf',
        name: 'Wolf',
        abilities: [],
        radius: 8,
        unitAITreeId: 'networkHunt',
    });
    const ctx = unit.aiContext as NetworkHuntAITreeContext;
    ctx.aiTree = 'networkHunt';
    ctx.aiState = 'nh_travel';
    return unit;
}

function createLanterniteNest(id: string, x: number, y: number, invulnerable: boolean): Unit {
    const unit = new Unit({
        id,
        x,
        y,
        hp: 20,
        maxHp: 20,
        speed: 0,
        teamId: 'nature',
        ownerId: 'ai',
        characterId: LANTERNITE_NEST_CHARACTER_ID,
        name: 'Lanternite Nest',
        abilities: [],
        radius: 16,
    });
    unit.tags = [UnitTag.Structure];
    if (invulnerable) unit.invulnerabilityGenerations = 1;
    return unit;
}

function createSwarmNest(id: string, x: number, y: number): Unit {
    const unit = new Unit({
        id,
        x,
        y,
        hp: 100,
        maxHp: 100,
        speed: 0,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: SWARM_NEST_CHARACTER_ID,
        name: 'Swarm Nest',
        abilities: [],
        radius: 16,
    });
    unit.tags = [UnitTag.Structure];
    return unit;
}

function createMockContext(options: {
    units: Unit[];
    mapNetwork: MapNetworkManager;
    terrainManager?: TerrainManager | null;
    gameTick?: number;
}): { context: AIContext; orders: BattleOrder[]; turnEnds: string[] } {
    const orders: BattleOrder[] = [];
    const turnEnds: string[] = [];
    const gameTick = options.gameTick ?? 100;

    const context: AIContext = {
        gameTick,
        gameTime: 0,
        getUnit: (id) => options.units.find((u) => u.id === id),
        getUnits: () => options.units,
        getSpecialTiles: () => [],
        getAliveDefendPoints: () => [],
        getLightSources: () => [],
        terrainManager: options.terrainManager ?? null,
        findGridPathForUnit: (_, fromCol, fromRow, toCol, toRow) =>
            options.terrainManager?.findGridPath(fromCol, fromRow, toCol, toRow) ?? null,
        queueOrder: (_atTick, order) => {
            orders.push(order);
        },
        emitTurnEnd: (unitId) => {
            turnEnds.push(unitId);
        },
        generateRandomInteger: (min, _max) => min,
        WORLD_WIDTH,
        WORLD_HEIGHT,
        hasLineOfSight: () => true,
        cancelActiveAbility: () => {},
        getAbilityUsesThisRound: () => 0,
        mapNetwork: options.mapNetwork,
    };
    return { context, orders, turnEnds };
}

describe('findEnemyStructuresForTravel', () => {
    it('includes invincible enemy structures while findEnemyStructures excludes them', () => {
        const hunter = createHunter('w1', 100, 100);
        const nest = createLanterniteNest('n1', 500, 100, true);
        expect(findEnemyStructures(hunter, [hunter, nest])).toHaveLength(0);
        expect(findEnemyStructuresForTravel(hunter, [hunter, nest])).toEqual([nest]);
    });
});

describe('nh_travel', () => {
    it('marches toward the next hop when the only enemy nest is invincible', () => {
        const mapNetwork = makeMapNetwork();
        const hunter = createHunter('w1', 100, 100); // at nest_a
        const swarmHome = createSwarmNest('swarm', 100, 100);
        const lanternite = createLanterniteNest('lantern', 500, 100, true); // at nest_c
        const units = [hunter, swarmHome, lanternite];
        mapNetwork.buildInitialMembership(units);

        const { context } = createMockContext({ units, mapNetwork, terrainManager: makeTerrain() });
        runUnitAI(hunter, NETWORK_HUNT_AI_TREE, context);

        const ctx = hunter.aiContext as NetworkHuntAITreeContext;
        expect(ctx.aiState).toBe('nh_travel');
        expect(ctx.targetStructureNodeId).toBe('nest_c');
        expect(hunter.movement?.path.length ?? 0).toBeGreaterThan(0);
        // Next hop along a→b→c is nest_b (empty middle), not a beeline to nest_c.
        const dest = hunter.movement!.path[hunter.movement!.path.length - 1]!;
        const destWorld = makeTerrain().grid.gridToWorld(dest.col, dest.row);
        expect(destWorld.x).toBe(300);
        expect(destWorld.y).toBe(100);
    });

    it('advances to an empty nest node when no enemy structures exist yet', () => {
        const mapNetwork = makeMapNetwork();
        const hunter = createHunter('w1', 100, 100);
        const swarmHome = createSwarmNest('swarm', 100, 100);
        const units = [hunter, swarmHome];
        mapNetwork.buildInitialMembership(units);

        const { context } = createMockContext({ units, mapNetwork, terrainManager: makeTerrain() });
        runUnitAI(hunter, NETWORK_HUNT_AI_TREE, context);

        const ctx = hunter.aiContext as NetworkHuntAITreeContext;
        expect(ctx.targetStructureNodeId).toBe('nest_b');
        expect(hunter.movement?.path.length ?? 0).toBeGreaterThan(0);
        const dest = hunter.movement!.path[hunter.movement!.path.length - 1]!;
        const destWorld = makeTerrain().grid.gridToWorld(dest.col, dest.row);
        expect(destWorld.x).toBe(300);
        expect(destWorld.y).toBe(100);
    });

    it('does not treat the ally-owned nest as a travel destination', () => {
        const mapNetwork = makeMapNetwork();
        // Hunter already at empty middle; only ally nest exists behind it — should push to nest_c empty.
        const hunter = createHunter('w1', 300, 100);
        const swarmHome = createSwarmNest('swarm', 100, 100);
        const units = [hunter, swarmHome];
        mapNetwork.buildInitialMembership(units);

        const { context } = createMockContext({ units, mapNetwork, terrainManager: makeTerrain() });
        runUnitAI(hunter, NETWORK_HUNT_AI_TREE, context);

        const ctx = hunter.aiContext as NetworkHuntAITreeContext;
        expect(ctx.targetStructureNodeId).toBe('nest_c');
        expect(ctx.targetStructureNodeId).not.toBe('nest_a');
    });
});
