import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../GameEngine';
import { resetGameObjectIdCounter } from '../../GameObject';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { TerrainType } from '../../../terrain/TerrainType';
import { createUnitFromSpawnConfig } from '../index';
import type { SpawnDefinition } from './spawnDefinition';
import { resolveActiveDarknessStrengths } from '../../../../../darknessStrength/resolve';
import {
    DS_ENEMY_HARDENED_ID,
    DS_ENEMY_HARDENED_MAX_HEALTH_MULT,
} from '../../../../../darknessStrength/packages/starters';
import { getDefaultHp } from '../unit_defs/unitDef';

function setupEngine(gridSize = 10): GameEngine {
    resetGameObjectIdCounter(1);
    const grid = new TerrainGrid(gridSize, gridSize, CELL_SIZE, TerrainType.Grass);
    const tm = new TerrainManager(grid);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1, terrainManager: tm });
    return engine;
}

function addPlayerAt(engine: GameEngine, x: number, y: number): void {
    const player = createUnitFromSpawnConfig(
        { characterId: 'player', name: 'P', x, y, teamId: 'player', ownerId: 'p1', abilities: [] },
        engine.eventBus,
        engine,
    );
    engine.addUnit(player, 'initialGameSpawn');
}

const BASE: Pick<SpawnDefinition, 'characterId' | 'teamId' | 'abilities'> = {
    characterId: 'dark_wolf',
    teamId: 'enemy',
    abilities: [],
};

describe('spawnUnit placement', () => {
    it('fixedWorld spawns exactly at the given point, count times', () => {
        const engine = setupEngine();
        const spawned = engine.spawnUnit({
            ...BASE,
            placement: { kind: 'fixedWorld', x: 123, y: 456 },
            count: 2,
        });
        expect(spawned).toHaveLength(2);
        for (const u of spawned) {
            expect(u.x).toBe(123);
            expect(u.y).toBe(456);
        }
    });

    it('edgeOfMap spawns units around the map border (getEdgePositions\' inset perimeter)', () => {
        const engine = setupEngine();
        const spawned = engine.spawnUnit({ ...BASE, placement: { kind: 'edgeOfMap' }, count: 3 });
        expect(spawned).toHaveLength(3);
        const PADDING = 40;
        const worldW = CELL_SIZE * 10;
        const worldH = CELL_SIZE * 10;
        for (const u of spawned) {
            const onBorder = u.x === PADDING || u.y === PADDING || u.x === worldW - PADDING || u.y === worldH - PADDING;
            expect(onBorder).toBe(true);
        }
    });

    it('anywhere with no target/zone scans the whole grid', () => {
        const engine = setupEngine();
        const spawned = engine.spawnUnit({ ...BASE, placement: { kind: 'anywhere' }, count: 1 });
        expect(spawned).toHaveLength(1);
    });

    it('anywhere with a spawnTarget circle constrains placement to that radius', () => {
        const engine = setupEngine();
        const targetWorld = { x: 200, y: 200 };
        const spawned = engine.spawnUnit({
            ...BASE,
            placement: { kind: 'anywhere', target: { x: targetWorld.x, y: targetWorld.y, radius: 1 } },
            count: 1,
        });
        expect(spawned).toHaveLength(1);
        const dx = spawned[0]!.x - targetWorld.x;
        const dy = spawned[0]!.y - targetWorld.y;
        expect(Math.sqrt(dx * dx + dy * dy)).toBeLessThanOrEqual(CELL_SIZE * 1 + 1);
    });

    it('closestToPlayers spawns near the average living-player position', () => {
        const engine = setupEngine();
        addPlayerAt(engine, 200, 200);
        const spawned = engine.spawnUnit({ ...BASE, placement: { kind: 'closestToPlayers' }, count: 1 });
        expect(spawned).toHaveLength(1);
        const dx = spawned[0]!.x - 200;
        const dy = spawned[0]!.y - 200;
        expect(Math.sqrt(dx * dx + dy * dy)).toBeLessThan(CELL_SIZE * 3);
    });

    it('closestToPlayers returns nothing when no living player exists', () => {
        const engine = setupEngine();
        const spawned = engine.spawnUnit({ ...BASE, placement: { kind: 'closestToPlayers' }, count: 1 });
        expect(spawned).toHaveLength(0);
    });

    it('closestEnemySpawnPoint (radius 0) spawns on the nearest tagged POI cell', () => {
        const engine = setupEngine();
        addPlayerAt(engine, 40, 40);
        engine.registerMapPOIs([
            { id: 'far', label: 'Far', col: 9, row: 9, type: 'enemySpawn' },
            { id: 'near', label: 'Near', col: 2, row: 2, type: 'enemySpawn' },
        ]);
        const spawned = engine.spawnUnit({
            ...BASE,
            placement: { kind: 'closestEnemySpawnPoint' },
            count: 1,
        });
        expect(spawned).toHaveLength(1);
        expect(spawned[0]!.x).toBe(2 * CELL_SIZE + CELL_SIZE / 2);
        expect(spawned[0]!.y).toBe(2 * CELL_SIZE + CELL_SIZE / 2);
    });

    it('closestEnemySpawnPoint returns nothing when no eligible POI exists', () => {
        const engine = setupEngine();
        addPlayerAt(engine, 40, 40);
        const spawned = engine.spawnUnit({ ...BASE, placement: { kind: 'closestEnemySpawnPoint' }, count: 1 });
        expect(spawned).toHaveLength(0);
    });

    it('relativeToUnit spawns within the given annulus around the anchor', () => {
        const engine = setupEngine();
        const anchor = createUnitFromSpawnConfig(
            { characterId: 'lanternite_nest', name: 'Nest', x: 300, y: 300, teamId: 'nature', ownerId: 'ai', abilities: [] },
            engine.eventBus,
            engine,
        );
        engine.addUnit(anchor, 'initialGameSpawn');

        const spawned = engine.spawnUnit({
            ...BASE,
            teamId: 'nature',
            placement: { kind: 'relativeToUnit', anchorUnitId: anchor.id, minRadiusPx: 10, maxRadiusPx: 30 },
            count: 5,
        });
        expect(spawned).toHaveLength(5);
        for (const u of spawned) {
            const dx = u.x - 300;
            const dy = u.y - 300;
            const dist = Math.sqrt(dx * dx + dy * dy);
            expect(dist).toBeGreaterThanOrEqual(9.9);
            expect(dist).toBeLessThanOrEqual(30.1);
        }
    });

    it('relativeToUnit returns nothing when the anchor unit is missing', () => {
        const engine = setupEngine();
        const spawned = engine.spawnUnit({
            ...BASE,
            placement: { kind: 'relativeToUnit', anchorUnitId: 'does-not-exist', maxRadiusPx: 30 },
            count: 1,
        });
        expect(spawned).toHaveLength(0);
    });

    it('networkNearestOwnedLeaf spawns on the nearest owned leaf node cell', () => {
        const engine = setupEngine();
        addPlayerAt(engine, 40, 40);
        const leafWorld = { x: 5 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 };
        engine.state.mapNetworkManager.loadFromSegments({
            nodes: [{ id: 'leaf', x: leafWorld.x, y: leafWorld.y, radius: CELL_SIZE, tags: ['nest'], segmentId: 'test' }],
            edges: [],
        });
        const nest = createUnitFromSpawnConfig(
            { characterId: 'swarm_nest', name: 'Swarm Nest', x: leafWorld.x, y: leafWorld.y, teamId: 'enemy', ownerId: 'ai', abilities: [] },
            engine.eventBus,
            engine,
        );
        engine.addUnit(nest, 'initialGameSpawn');
        engine.state.mapNetworkManager.buildInitialMembership(engine.units);

        const spawned = engine.spawnUnit({
            ...BASE,
            placement: { kind: 'networkNearestOwnedLeaf', ownerCharacterIds: ['swarm_nest'] },
            count: 1,
        });
        expect(spawned).toHaveLength(1);
        expect(spawned[0]!.x).toBe(leafWorld.x);
        expect(spawned[0]!.y).toBe(leafWorld.y);
    });

    it('networkNearestOwnedLeaf ignores a node with 2+ edges even when owned and closer', () => {
        const engine = setupEngine();
        addPlayerAt(engine, 40, 40);
        const hubWorld = { x: 2 * CELL_SIZE + CELL_SIZE / 2, y: 2 * CELL_SIZE + CELL_SIZE / 2 };
        const leafWorld = { x: 8 * CELL_SIZE + CELL_SIZE / 2, y: 8 * CELL_SIZE + CELL_SIZE / 2 };
        engine.state.mapNetworkManager.loadFromSegments({
            nodes: [
                { id: 'hub', x: hubWorld.x, y: hubWorld.y, radius: CELL_SIZE, tags: [], segmentId: 'test' },
                { id: 'leafA', x: leafWorld.x, y: leafWorld.y, radius: CELL_SIZE, tags: [], segmentId: 'test' },
                { id: 'leafB', x: 9 * CELL_SIZE + CELL_SIZE / 2, y: 9 * CELL_SIZE + CELL_SIZE / 2, radius: CELL_SIZE, tags: [], segmentId: 'test' },
            ],
            edges: [
                ['hub', 'leafA'],
                ['hub', 'leafB'],
            ],
        });
        for (const world of [hubWorld, leafWorld]) {
            const unit = createUnitFromSpawnConfig(
                { characterId: 'swarm_nest', name: 'Swarm Nest', x: world.x, y: world.y, teamId: 'enemy', ownerId: 'ai', abilities: [] },
                engine.eventBus,
                engine,
            );
            engine.addUnit(unit, 'initialGameSpawn');
        }
        engine.state.mapNetworkManager.buildInitialMembership(engine.units);

        const spawned = engine.spawnUnit({
            ...BASE,
            placement: { kind: 'networkNearestOwnedLeaf', ownerCharacterIds: ['swarm_nest'] },
            count: 1,
        });
        expect(spawned).toHaveLength(1);
        expect(spawned[0]!.x).toBe(leafWorld.x);
        expect(spawned[0]!.y).toBe(leafWorld.y);
    });

    it('networkNearestOwnedLeaf returns nothing when no eligible owned leaf node exists', () => {
        const engine = setupEngine();
        addPlayerAt(engine, 40, 40);
        const spawned = engine.spawnUnit({
            ...BASE,
            placement: { kind: 'networkNearestOwnedLeaf' },
            count: 1,
        });
        expect(spawned).toHaveLength(0);
    });

    it('networkNearestOwnedLeaf respects maxDistance, skipping a leaf node beyond the cap', () => {
        const engine = setupEngine();
        addPlayerAt(engine, 40, 40);
        const farWorld = { x: 9 * CELL_SIZE + CELL_SIZE / 2, y: 9 * CELL_SIZE + CELL_SIZE / 2 };
        engine.state.mapNetworkManager.loadFromSegments({
            nodes: [{ id: 'leaf', x: farWorld.x, y: farWorld.y, radius: CELL_SIZE, tags: [], segmentId: 'test' }],
            edges: [],
        });
        const nest = createUnitFromSpawnConfig(
            { characterId: 'swarm_nest', name: 'Swarm Nest', x: farWorld.x, y: farWorld.y, teamId: 'enemy', ownerId: 'ai', abilities: [] },
            engine.eventBus,
            engine,
        );
        engine.addUnit(nest, 'initialGameSpawn');
        engine.state.mapNetworkManager.buildInitialMembership(engine.units);

        const spawned = engine.spawnUnit({
            ...BASE,
            placement: { kind: 'networkNearestOwnedLeaf', ownerCharacterIds: ['swarm_nest'], maxDistance: 1 },
            count: 1,
        });
        expect(spawned).toHaveLength(0);
    });
});

describe('spawnUnit aiHookup', () => {
    it('lanternite hookup wires role/patrol/nest-owner fields', () => {
        const engine = setupEngine();
        const spawned = engine.spawnUnit({
            ...BASE,
            characterId: 'lanternite',
            teamId: 'nature',
            placement: { kind: 'fixedWorld', x: 0, y: 0 },
            aiHookup: {
                kind: 'lanternite',
                role: 'scout',
                targetNestPoiId: 'nest_b',
                patrolFarWorld: { x: 10, y: 20 },
                nestOwnerUnitId: 'nest_a_unit',
                constructionAngle: 1.5,
            },
        });
        const unit = spawned[0]!;
        expect(unit.lanterniteState.role).toBe('scout');
        expect(unit.lanterniteState.targetNestPoiId).toBe('nest_b');
        expect(unit.lanterniteState.patrolFarWorld).toEqual({ x: 10, y: 20 });
        expect(unit.lanterniteState.nestOwnerUnitId).toBe('nest_a_unit');
        expect(unit.lanterniteState.constructionAngle).toBe(1.5);
    });

    it('pet hookup wires the pet and pushes onto the owner unitIds', () => {
        const engine = setupEngine();
        const owner = createUnitFromSpawnConfig(
            { characterId: 'player', name: 'P', x: 0, y: 0, teamId: 'player', ownerId: 'p1', abilities: [] },
            engine.eventBus,
            engine,
        );
        engine.addUnit(owner, 'initialGameSpawn');

        const spawned = engine.spawnUnit({
            ...BASE,
            characterId: 'dog',
            teamId: 'player',
            ownerId: 'ai',
            placement: { kind: 'fixedWorld', x: 40, y: 0 },
            aiHookup: { kind: 'pet', ownerUnitId: owner.id, defId: 'dog' },
        });
        const pet = spawned[0]!;
        expect(pet.petState.ownerUnitId).toBe(owner.id);
        expect(pet.petState.defId).toBe('dog');
        expect(owner.petState.unitIds).toContain(pet.id);
    });

    it('omitted aiHookup leaves ecology state untouched', () => {
        const engine = setupEngine();
        const spawned = engine.spawnUnit({ ...BASE, placement: { kind: 'fixedWorld', x: 0, y: 0 } });
        expect(spawned[0]!.lanterniteState.role).toBeNull();
    });
});

describe('spawnUnit DarknessStrength statBag', () => {
    it('bakes active enemy packages onto spawned units', () => {
        const engine = setupEngine();
        engine.setActiveDarknessStrengths(
            resolveActiveDarknessStrengths({ instances: [{ packageId: DS_ENEMY_HARDENED_ID }] }),
        );
        const baseHp = getDefaultHp('swarmling');
        const spawned = engine.spawnUnit({
            characterId: 'swarmling',
            teamId: 'enemy',
            abilities: [],
            placement: { kind: 'fixedWorld', x: 80, y: 80 },
        });
        expect(spawned).toHaveLength(1);
        expect(spawned[0]!.maxHp).toBe(Math.floor(baseHp * DS_ENEMY_HARDENED_MAX_HEALTH_MULT));
        expect(spawned[0]!.passiveBonuses?.maxHealth?.mult).toBe(DS_ENEMY_HARDENED_MAX_HEALTH_MULT);
    });
});
