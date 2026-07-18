/**
 * Tests for snet_seek's population-gradient hop-by-hop migration + reassign-on-arrival state
 * machine. See snet_seek.ts's header comment for the design.
 */
import { describe, it, expect } from 'vitest';
import { Unit } from '../../Unit';
import type { AIContext } from '../types';
import type { SwarmlingNetworkAITreeContext } from './context';
import type { BattleOrder } from '../../../types';
import { runUnitAI, SWARMLING_NETWORK_AI_TREE } from '../index';
import { TerrainGrid } from '../../../../terrain/TerrainGrid';
import { TerrainManager } from '../../../../terrain/TerrainManager';
import { TerrainType } from '../../../../terrain/TerrainType';
import { CELL_SIZE } from '../../../../terrain/TerrainGrid';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../../../GameEngine';
import { MapNetworkManager } from '../../../managers/mapNetwork/MapNetworkManager';
import type { ResolvedMapNetwork } from '../../../managers/mapNetwork/types';
import { SWARM_NEST_CHARACTER_ID } from '../../../lanternite/swarmNestTick';

// Chain a - b - c, all 'nest'-tagged and unclaimed unless a test says otherwise. 'iso' is a
// disconnected fourth node (also 'nest'-tagged) used for the Euclidean-fallback test, and 'far'
// is a distant unclaimed node reachable only via the whole-graph Euclidean scan from 'iso'.
const NETWORK: ResolvedMapNetwork = {
    nodes: [
        { id: 'a', x: 100, y: 100, radius: 20, tags: ['nest'], segmentId: 'seg1' },
        { id: 'b', x: 300, y: 100, radius: 20, tags: ['nest'], segmentId: 'seg1' },
        { id: 'c', x: 500, y: 100, radius: 20, tags: ['nest'], segmentId: 'seg1' },
        { id: 'iso', x: 900, y: 100, radius: 20, tags: ['nest'], segmentId: 'seg2' },
        { id: 'far', x: 900, y: 500, radius: 20, tags: ['nest'], segmentId: 'seg2' },
    ],
    edges: [
        ['a', 'b'],
        ['b', 'c'],
    ],
};

function makeMapNetwork(): MapNetworkManager {
    const mgr = new MapNetworkManager();
    mgr.loadFromSegments(NETWORK);
    return mgr;
}

function createSwarmling(id: string, x: number, y: number, overrides: Partial<{ currentNodeId: string | null; targetNodeId: string | null }> = {}): Unit {
    const unit = new Unit({
        id,
        x,
        y,
        hp: 5,
        maxHp: 5,
        speed: 100,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'swarmling',
        name: 'Swarmling',
        abilities: [],
        radius: 8,
        unitAITreeId: 'swarmlingNetwork',
    });
    const ctx = unit.aiContext as SwarmlingNetworkAITreeContext;
    ctx.aiTree = 'swarmlingNetwork';
    ctx.aiState = 'snet_seek';
    if (overrides.currentNodeId !== undefined) unit.swarmState.currentNodeId = overrides.currentNodeId;
    if (overrides.targetNodeId !== undefined) unit.swarmState.targetNodeId = overrides.targetNodeId;
    return unit;
}

function createSwarmNestHome(id: string, x: number, y: number, homeNestPoiId: string): Unit {
    return new Unit({
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
    });
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
        characterId: 'player',
        portraitId: 'warrior',
        name: 'Player',
        abilities: [],
        radius: 20,
    });
}

function createMockContext(options: {
    units: Unit[];
    mapNetwork: MapNetworkManager;
    terrainManager?: TerrainManager | null;
    gameTick?: number;
    gameTime?: number;
}): { context: AIContext; orders: BattleOrder[]; turnEnds: string[] } {
    const orders: BattleOrder[] = [];
    const turnEnds: string[] = [];
    const gameTick = options.gameTick ?? 100;
    const gameTime = options.gameTime ?? 0;

    const context: AIContext = {
        gameTick,
        gameTime,
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

function makeTerrain(): TerrainManager {
    const grid = new TerrainGrid(30, 20, CELL_SIZE, TerrainType.Grass);
    return new TerrainManager(grid);
}

describe('snet_seek', () => {
    it('resolves currentNodeId from spawn position on first tick (implicit first arrival)', () => {
        const mapNetwork = makeMapNetwork();
        const unit = createSwarmling('s1', 100, 100); // inside node 'a''s radius
        const { context } = createMockContext({ units: [unit], mapNetwork, terrainManager: makeTerrain() });

        runUnitAI(unit, SWARMLING_NETWORK_AI_TREE, context);

        expect(unit.swarmState.currentNodeId).toBe('a');
    });

    it('settles and starts construction when currentNodeId is a valid unclaimed nest node', () => {
        const mapNetwork = makeMapNetwork();
        const unit = createSwarmling('s1', 100, 100, { currentNodeId: 'a' });
        const { context } = createMockContext({ units: [unit], mapNetwork, terrainManager: makeTerrain(), gameTime: 10 });

        runUnitAI(unit, SWARMLING_NETWORK_AI_TREE, context);

        expect(unit.swarmState.constructionCompleteAtGameTime).not.toBeNull();
        expect(unit.swarmState.constructionCompleteAtGameTime).toBeGreaterThan(10);
        expect(unit.swarmState.targetNodeId).toBeNull();
    });

    it('picks the strictly-lower-population neighbor as next hop when current node is claimed', () => {
        const mapNetwork = makeMapNetwork();
        // 'b' is claimed by a swarm_nest — not a valid build site, forces a gradient decision.
        const nestAtB = createSwarmNestHome('nest_b', 300, 100, 'b');
        nestAtB.swarmState.homeNestPoiId = 'b';
        // Two other swarmlings already settled at 'b' (population 2 there), 'a' stays empty.
        const otherAtB1 = createSwarmling('other1', 300, 100, { currentNodeId: 'b' });
        const otherAtB2 = createSwarmling('other2', 300, 100, { currentNodeId: 'b' });
        const unit = createSwarmling('s1', 300, 100, { currentNodeId: 'b' });

        const { context } = createMockContext({
            units: [unit, nestAtB, otherAtB1, otherAtB2],
            mapNetwork,
            terrainManager: makeTerrain(),
        });

        runUnitAI(unit, SWARMLING_NETWORK_AI_TREE, context);

        expect(unit.swarmState.targetNodeId).toBe('a');
        expect(unit.swarmState.currentNodeId).toBe('b'); // unchanged until arrival
        expect(unit.swarmState.constructionCompleteAtGameTime).toBeNull();
    });

    it('reassigns currentNodeId on arrival at a committed target node', () => {
        const mapNetwork = makeMapNetwork();
        // Positioned right on top of node 'b' with targetNodeId already committed from 'a'.
        const unit = createSwarmling('s1', 300, 100, { currentNodeId: 'a', targetNodeId: 'b' });
        const { context } = createMockContext({ units: [unit], mapNetwork, terrainManager: makeTerrain() });

        runUnitAI(unit, SWARMLING_NETWORK_AI_TREE, context);

        expect(unit.swarmState.currentNodeId).toBe('b');
    });

    it('does not reconsider its target while in transit (targetNodeId stable across ticks before arrival)', () => {
        const mapNetwork = makeMapNetwork();
        // Far from 'b' (its committed target) — not yet arrived.
        const unit = createSwarmling('s1', 100, 100, { currentNodeId: 'a', targetNodeId: 'b' });
        const { context } = createMockContext({ units: [unit], mapNetwork, terrainManager: makeTerrain() });

        runUnitAI(unit, SWARMLING_NETWORK_AI_TREE, context);
        expect(unit.swarmState.targetNodeId).toBe('b');
        expect(unit.swarmState.currentNodeId).toBe('a');

        runUnitAI(unit, SWARMLING_NETWORK_AI_TREE, context);
        expect(unit.swarmState.targetNodeId).toBe('b');
        expect(unit.swarmState.currentNodeId).toBe('a');
    });

    it('does not oscillate between two nodes with tied population (strictly-lower settling rule)', () => {
        // Standalone two-node network (not the shared a-b-c-iso-far fixture) so the Euclidean
        // fallback in findUnclaimedNetworkNode has no unclaimed node anywhere to "escape" to —
        // isolates a pure population-gradient comparison with no settling/bootstrap short-circuit.
        const mapNetwork = new MapNetworkManager();
        mapNetwork.loadFromSegments({
            nodes: [
                { id: 'x', x: 100, y: 100, radius: 20, tags: ['nest'], segmentId: 'seg1' },
                { id: 'y', x: 300, y: 100, radius: 20, tags: ['nest'], segmentId: 'seg1' },
            ],
            edges: [['x', 'y']],
        });
        const nestAtX = createSwarmNestHome('nest_x', 100, 100, 'x');
        nestAtX.swarmState.homeNestPoiId = 'x';
        const nestAtY = createSwarmNestHome('nest_y', 300, 100, 'y');
        nestAtY.swarmState.homeNestPoiId = 'y';
        const unitAtA = createSwarmling('s_a', 100, 100, { currentNodeId: 'x' });
        const unitAtB = createSwarmling('s_b', 300, 100, { currentNodeId: 'y' });

        const { context } = createMockContext({
            units: [unitAtA, unitAtB, nestAtX, nestAtY],
            mapNetwork,
            terrainManager: makeTerrain(),
        });

        runUnitAI(unitAtA, SWARMLING_NETWORK_AI_TREE, context);
        runUnitAI(unitAtB, SWARMLING_NETWORK_AI_TREE, context);

        // Tied population (1 vs 1) — neither should have committed to a hop.
        expect(unitAtA.swarmState.targetNodeId).toBeNull();
        expect(unitAtB.swarmState.targetNodeId).toBeNull();
        expect(unitAtA.swarmState.currentNodeId).toBe('x');
        expect(unitAtB.swarmState.currentNodeId).toBe('y');
    });

    it('falls back to the whole-graph Euclidean scan when BFS from an isolated claimed node finds nothing', () => {
        // Standalone network: 'iso' has no edges and is claimed — pickGradientNeighbor and the
        // BFS half of findUnclaimedNetworkNode both fail; only the disconnected, unclaimed 'far'
        // node is reachable at all, and only via the whole-graph Euclidean fallback.
        const mapNetwork = new MapNetworkManager();
        mapNetwork.loadFromSegments({
            nodes: [
                { id: 'iso', x: 900, y: 100, radius: 20, tags: ['nest'], segmentId: 'seg1' },
                { id: 'far', x: 900, y: 500, radius: 20, tags: ['nest'], segmentId: 'seg2' },
            ],
            edges: [],
        });
        const nestAtIso = createSwarmNestHome('nest_iso', 900, 100, 'iso');
        nestAtIso.swarmState.homeNestPoiId = 'iso';
        const unit = createSwarmling('s1', 900, 100, { currentNodeId: 'iso' });

        const { context } = createMockContext({
            units: [unit, nestAtIso],
            mapNetwork,
            terrainManager: makeTerrain(),
        });

        runUnitAI(unit, SWARMLING_NETWORK_AI_TREE, context);

        expect(unit.swarmState.targetNodeId).toBe('far');
    });

    it('switches to snet_hunt when a hostile is within alert radius, unchanged from before this refactor', () => {
        const mapNetwork = makeMapNetwork();
        const unit = createSwarmling('s1', 100, 100, { currentNodeId: 'a' });
        const player = createPlayerUnit('p1', 120, 100); // well within ALERT_RADIUS_PX
        const { context } = createMockContext({ units: [unit, player], mapNetwork, terrainManager: makeTerrain() });

        runUnitAI(unit, SWARMLING_NETWORK_AI_TREE, context);

        const ctx = unit.aiContext as SwarmlingNetworkAITreeContext;
        expect(ctx.aiState).toBe('snet_hunt');
        expect(ctx.huntTargetId).toBe('p1');
        // No gradient decision should have run this tick.
        expect(unit.swarmState.targetNodeId).toBeNull();
    });
});
