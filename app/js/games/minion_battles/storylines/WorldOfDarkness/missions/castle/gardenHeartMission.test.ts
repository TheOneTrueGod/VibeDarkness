/**
 * The Garden Heart mission: it loads the 2x2 arena, spawns the Heart with its phase-1 tree, the authored sprout points
 * line up with passable ground, and a retreat runs end to end (emptying the first health pool burrows the Heart, the old tree dies to
 * Briar, the phase-2 tree grows at the new point, the resprout eruption is Reactable and lands).
 */
import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../../game/GameObject';
import { TerrainManager } from '../../../../terrain/TerrainManager';
import { TerrainType } from '../../../../terrain/TerrainType';
import { CELL_SIZE } from '../../../../terrain/TerrainGrid';
import { resolveParallelOrderPause } from '../../../../testing/runner/SimulationRunner';
import { registerWorldOfDarknessSegments } from '../../registerSegments';
import { GARDEN_DARKNESS_TRIGGER_ID, GARDEN_HEART, GARDEN_HEART_MISSION_ID, GARDEN_LIGHT_BOOST } from '../020_garden_heart';
import { CRYSTAL_TILE_DEFAULTS, DARK_CRYSTAL_TILE_DEFAULTS } from '../../MapSegments/50_50_crystal_cave';
import { castlePoi, castlePoiCell, type CastleMission } from './castleMission';
import { SEGMENT_62_47_QUEENS_GARDEN } from '../../MapSegments/castle/62_47_queens_garden';
import {
    GARDEN_ERUPTION_RADIUS_PX,
    GARDEN_PHASE_SPROUT_CELLS,
    GARDEN_PHASE_SPROUT_POINTS,
    GARDEN_POND_ISLAND_RADIUS_TILES,
    GARDEN_SPROUT_MIN_PARTY_DISTANCE_PX,
} from '../../../../card_defs/16_enemy_garden_heart/gardenHeartPhases';
import { getEnemyHealthMultiplier } from '../../../../constants/enemyConstants';
import { ENEMY_GARDEN_HEART } from '../../../../constants/enemyConstants';
import { getNodeChildIds } from '../../../../game/units/components/nodeTree';
import { gardenTreeLayout } from '../../../../game/gardenHeart/gardenTreeLayouts';
import { peekPhaseState } from '../../../../game/units/components/phaseComponent';
import { attachReflexIfKnown } from '../../../../resources/Reflex';
import { getBattleVariable } from '../../../../game/battleVariables';
import { GARDEN_GROWTH_PHASE_VARIABLE, GARDEN_HEART_HEALTH_POOLS } from '../../../../card_defs/16_enemy_garden_heart/gardenHeartConstants';
import { KNOWLEDGE_REACTIONS } from '../../../../../../accountKnowledge';
import type { Unit } from '../../../../game/units/Unit';
import { UnitTag } from '../../../../game/units/unitTag';
import { isBurrowEmerging } from '../../../../game/units/components/burrowEmergeHooks';
import '../../../../abilities/AbilityRegistry';

registerWorldOfDarknessSegments();

/** Share of the Heart's max HP left when growth phase `phase` (2-4) is entered: the later phases' health pools. */
const retreatFraction = (phase: 2 | 3 | 4): number =>
    GARDEN_HEART_HEALTH_POOLS.slice(phase - 1).reduce((a, b) => a + b, 0) / GARDEN_HEART_HEALTH_POOLS.reduce((a, b) => a + b, 0);

const ARENA_IDS = ['62_47_queens_garden', '63_47_conservatory', '62_48_herb_garden', '63_48_orchard'];

function initMission(mission: CastleMission, opts: { knowsReactions?: boolean } = {}): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    const terrainManager = new TerrainManager(mission.createTerrain());
    // Passing the terrain here also attaches its floor layers (Briar is a floor tile).
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 7, terrainManager });
    if (opts.knowsReactions) engine.playerKnowledgeKeysByPlayer = { p1: [KNOWLEDGE_REACTIONS] };
    const composed = mission.composeMap();
    mission.initializeGameState(engine, {
        playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: { p1: ['004'] },
        terrainManager,
        terrainSegmentPOIs: composed?.pois,
        terrainSegmentZones: composed?.zones,
    });
    engine.registerBattleObjectives(mission.battleObjectives ?? []);
    return engine;
}

function stepTick(engine: GameEngine): void {
    resolveParallelOrderPause(engine);
    engine.stepSimulationFixedTicks(1);
}

const heartOf = (engine: GameEngine): Unit => engine.units.find((u) => u.characterId === 'garden_heart')!;

function countBriar(engine: GameEngine): number {
    const tm = engine.terrainManager!;
    let n = 0;
    for (let row = 0; row < tm.grid.height; row++) {
        for (let col = 0; col < tm.grid.width; col++) {
            if (tm.getEffectiveTerrainType(col, row) === TerrainType.Briar) n++;
        }
    }
    return n;
}

describe('Garden Heart mission', () => {
    it('stitches the four arena segments 2x2, grants Reactions at the start and has no escort', () => {
        expect(GARDEN_HEART.missionId).toBe(GARDEN_HEART_MISSION_ID);
        expect(GARDEN_HEART.segmentIds).toEqual(ARENA_IDS);
        expect(GARDEN_HEART.mapLayout).toEqual([
            [{ kind: 'segment', id: ARENA_IDS[0] }, { kind: 'segment', id: ARENA_IDS[1] }],
            [{ kind: 'segment', id: ARENA_IDS[2] }, { kind: 'segment', id: ARENA_IDS[3] }],
        ]);
        expect(GARDEN_HEART.worldWidth).toBe(44 * CELL_SIZE);
        expect(GARDEN_HEART.worldHeight).toBe(44 * CELL_SIZE);
        expect(GARDEN_HEART.startRewards).toEqual({ knowledgeKeys: [KNOWLEDGE_REACTIONS] });
        expect(GARDEN_HEART.missionType).toBe('boss');
    });

    it('lets wolves in from phase 2: a continuous dark_wolf spawn gated on the growth-phase trigger, scaled by darkness', () => {
        const trigger = GARDEN_HEART.triggers?.find((t) => t.id === GARDEN_DARKNESS_TRIGGER_ID);
        expect(trigger).toBeDefined();
        expect(trigger!.events).toEqual([{ type: 'everyTick' }]);
        expect(trigger!.conditions).toEqual([
            { type: 'battleVariableAtLeast', variable: GARDEN_GROWTH_PHASE_VARIABLE, value: 2 },
        ]);

        const spawn = GARDEN_HEART.levelEvents.find((e) => e.type === 'continuousSpawn');
        expect(spawn?.type).toBe('continuousSpawn');
        if (spawn?.type !== 'continuousSpawn') return;
        expect(spawn.afterTrigger).toBe(GARDEN_DARKNESS_TRIGGER_ID);
        expect(spawn.darknessScaling).toEqual({
            minShare: 0.15,
            intervalRounds: { atMin: 2, atFull: 1 },
            maxUnits: { base: 1, perShare: 2 },
        });
        expect(spawn.spawns).toHaveLength(1);
        expect(spawn.spawns[0]).toMatchObject({
            characterId: 'dark_wolf',
            spawnBehaviour: 'anywhere',
            inDarkness: true,
            unitAITreeId: 'hunt',
        });
    });

    it('authors each phase where it should: 2 centre-left, 3 north-east on passable ground, 4 in the pond\'s deep water', () => {
        const grid = GARDEN_HEART.createTerrain();
        const ground = [TerrainType.Grass, TerrainType.Dirt, TerrainType.ThickGrass];
        for (const c of GARDEN_PHASE_SPROUT_CELLS[2]) {
            expect(ground).toContain(grid.get(c.col, c.row));
            expect(c.col).toBeLessThan(grid.width / 4); // left edge
            expect(Math.abs(c.row - grid.height / 2)).toBeLessThanOrEqual(5); // around the middle row
        }
        for (const c of GARDEN_PHASE_SPROUT_CELLS[3]) {
            expect(ground).toContain(grid.get(c.col, c.row));
            expect(c.col).toBeGreaterThan(grid.width / 2 - 1); // right half
            expect(c.row).toBeLessThan(grid.height / 4); // top
        }
        for (const c of GARDEN_PHASE_SPROUT_CELLS[4]) expect(grid.get(c.col, c.row)).toBe(TerrainType.DeepWater);
    });

    it('spawns the Heart on the boss POI with the phase-1 tree grown and no escort', () => {
        const engine = initMission(GARDEN_HEART);
        const hearts = engine.units.filter((u) => u.characterId === ENEMY_GARDEN_HEART.characterId);
        expect(hearts).toHaveLength(1);
        const heart = hearts[0]!;
        expect(GARDEN_HEART.bossCell).toEqual(
            castlePoiCell(GARDEN_HEART.rooms, castlePoi(SEGMENT_62_47_QUEENS_GARDEN, '62_47_boss')),
        );
        expect({ col: Math.floor(heart.x / CELL_SIZE), row: Math.floor(heart.y / CELL_SIZE) }).toEqual(GARDEN_HEART.bossCell);

        const phase1 = gardenTreeLayout(1)!;
        expect(getNodeChildIds(heart)).toHaveLength(phase1.filter((s) => s.parent === null).length);
        const treeUnits = engine.units.filter((u) => u.id !== heart.id && u.teamId === 'enemy');
        expect(treeUnits).toHaveLength(phase1.length); // nothing but the tree: no wolf escort
        expect(treeUnits.some((u) => u.characterId === 'thornspitter')).toBe(true);
        for (const u of treeUnits) expect(engine.terrainManager!.isPassable(u.x, u.y)).toBe(true);
        expect(getBattleVariable(engine, GARDEN_GROWTH_PHASE_VARIABLE)).toBe(1); // the fight starts in growth phase 1
        // Its health is the sum of the per-phase pools (one player: no scaling).
        expect(heart.maxHp).toBe(GARDEN_HEART_HEALTH_POOLS.reduce((sum, n) => sum + n, 0) * getEnemyHealthMultiplier(engine.enemyScalingPlayerCount));
        engine.destroy();
    });

    it('starts the Heart in the upper-left quarter by a crystal, its first node between it and the party', () => {
        const engine = initMission(GARDEN_HEART);
        const heart = heartOf(engine);
        const grid = GARDEN_HEART.createTerrain();
        const cell = GARDEN_HEART.bossCell!;
        expect(cell.col).toBeLessThan(grid.width / 2);
        expect(cell.row).toBeLessThan(grid.height / 2);
        const crystalNear = engine.specialTiles.some(
            (t) => t.defId === 'DarkCrystal' && Math.hypot(t.col - cell.col, t.row - cell.row) <= 3,
        );
        expect(crystalNear).toBe(true);

        const player = engine.units.find((u) => u.teamId === 'player')!;
        const node = engine.getUnit(getNodeChildIds(heart)[0]!)!;
        const toPlayer = Math.hypot(player.x - heart.x, player.y - heart.y);
        // Closer to the party than the Heart is, and on the Heart-party line (within a tile of it).
        expect(Math.hypot(player.x - node.x, player.y - node.y)).toBeLessThan(toPlayer);
        const cross = Math.abs((player.x - heart.x) * (node.y - heart.y) - (player.y - heart.y) * (node.x - heart.x));
        expect(cross / toPlayer).toBeLessThanOrEqual(CELL_SIZE);
        engine.destroy();
    });

    it('rings the pond with untinted corrupted crystal lights, four-way symmetric, on open ground', () => {
        const engine = initMission(GARDEN_HEART);
        const grid = GARDEN_HEART.createTerrain();
        const crystals = engine.specialTiles.filter((t) => t.defId === 'DarkCrystal');
        expect(crystals).toHaveLength(12);
        const cells = new Set(crystals.map((t) => `${t.col}:${t.row}`));
        for (const t of crystals) {
            // Plain light: FireLight (no typed wash) and no purple colour filter.
            expect(t.colorFilter).toBeUndefined();
            expect(t.emitsLight).toMatchObject({
                lightType: 'FireLight',
                lightAmount: DARK_CRYSTAL_TILE_DEFAULTS.emitsLight!.lightAmount + GARDEN_LIGHT_BOOST.lightAmount,
                radius: DARK_CRYSTAL_TILE_DEFAULTS.emitsLight!.radius + GARDEN_LIGHT_BOOST.radius,
            });
            expect([TerrainType.Grass, TerrainType.Dirt, TerrainType.ThickGrass]).toContain(grid.get(t.col, t.row));
            expect(cells.has(`${43 - t.col}:${t.row}`)).toBe(true);
            expect(cells.has(`${t.col}:${43 - t.row}`)).toBe(true);
        }
        engine.destroy();
    });

    it('lights the entrance with two boosted clean crystals against the west wall', () => {
        const engine = initMission(GARDEN_HEART);
        const grid = GARDEN_HEART.createTerrain();
        const crystals = engine.specialTiles.filter((t) => t.defId === 'Crystal');
        expect(crystals.map((t) => ({ col: t.col, row: t.row }))).toEqual([{ col: 1, row: 8 }, { col: 1, row: 12 }]);
        for (const t of crystals) {
            expect(grid.get(t.col - 1, t.row)).toBe(TerrainType.Brick);
            expect(t.emitsLight).toMatchObject({
                lightType: 'DayLight',
                lightAmount: CRYSTAL_TILE_DEFAULTS.emitsLight!.lightAmount + GARDEN_LIGHT_BOOST.lightAmount,
                radius: CRYSTAL_TILE_DEFAULTS.emitsLight!.radius + GARDEN_LIGHT_BOOST.radius,
            });
        }
        engine.destroy();
    });

    it('a retreat when the first health pool is gone: clamped hit, the old tree dies to Briar, the Heart resurfaces with the phase-2 tree', () => {
        const engine = initMission(GARDEN_HEART);
        const heart = heartOf(engine);
        const maxHp = heart.maxHp;
        const oldTree = engine.units.filter((u) => u.id !== heart.id && u.teamId === 'enemy');
        expect(oldTree.length).toBeGreaterThan(0);
        const briarBefore = countBriar(engine);

        heart.takeDamage(maxHp * 5, null, engine.eventBus);
        expect(heart.hp).toBeCloseTo(maxHp * retreatFraction(2), 5);
        expect(peekPhaseState(heart)!.burrow?.stage).toBe('close');
        const burrow = peekPhaseState(heart)!.burrow!;
        expect(GARDEN_PHASE_SPROUT_POINTS[2].some((p) => p.x === burrow.toX && p.y === burrow.toY)).toBe(true);
        // The candidate closest to the party (all are farther than the minimum).
        const hero = engine.units.find((u) => u.teamId === 'player')!;
        const partyDist = (p: { x: number; y: number }) => Math.hypot(p.x - hero.x, p.y - hero.y);
        const closest = Math.min(...GARDEN_PHASE_SPROUT_POINTS[2].map(partyDist));
        expect(closest).toBeGreaterThanOrEqual(GARDEN_SPROUT_MIN_PARTY_DISTANCE_PX);
        expect(partyDist({ x: burrow.toX, y: burrow.toY })).toBe(closest);

        let guard = 0;
        while (peekPhaseState(heart)!.burrow && guard++ < 60 * 12) stepTick(engine);
        expect(peekPhaseState(heart)!.burrow).toBeNull();
        expect([heart.x, heart.y]).toEqual([burrow.toX, burrow.toY]);
        expect(heart.hp).toBeCloseTo(maxHp * retreatFraction(2), 5);

        for (const u of oldTree) expect(u.isAlive()).toBe(false);
        expect(countBriar(engine)).toBeGreaterThan(briarBefore);

        const phase2 = gardenTreeLayout(2)!;
        const fresh = engine.units.filter((u) => u.isAlive() && u.teamId === 'enemy' && u.id !== heart.id);
        expect(fresh).toHaveLength(phase2.length);
        expect(getNodeChildIds(heart)).toHaveLength(phase2.filter((s) => s.parent === null).length);
        expect(fresh.some((u) => u.characterId === 'pod_mortar')).toBe(true); // phase 2 = Thornspitter + Pod Mortar
        for (const u of fresh) expect(Math.hypot(u.x - heart.x, u.y - heart.y)).toBeLessThan(10 * CELL_SIZE);

        // The entry: as the Heart finishes rising, its new nodes are still underground at it, untargetable; they burrow
        // out to their spots, then stand there like any node.
        for (const u of fresh) {
            expect(isBurrowEmerging(u)).toBe(true);
            expect(u.tags.includes(UnitTag.Invincible)).toBe(true);
            expect(Math.hypot(u.x - heart.x, u.y - heart.y)).toBeLessThan(1);
        }
        for (let i = 0; i < 60 * 2; i++) stepTick(engine);
        for (const u of fresh) {
            expect(isBurrowEmerging(u)).toBe(false);
            expect(u.tags.includes(UnitTag.Invincible)).toBe(false);
            expect(Math.hypot(u.x - heart.x, u.y - heart.y)).toBeGreaterThan(2 * CELL_SIZE);
        }
        engine.destroy();
    });

    it('phase 3 comes up north-east, and phase 4 rises in the pond on new grass with 3-wide fords north and west', () => {
        const engine = initMission(GARDEN_HEART);
        const heart = heartOf(engine);
        const tm = engine.terrainManager!;
        const retreatTo = (fraction: number): void => {
            heart.takeDamage(heart.hp - heart.maxHp * fraction + heart.maxHp, null, engine.eventBus);
            expect(heart.hp).toBeCloseTo(heart.maxHp * fraction, 5);
            let guard = 0;
            while (peekPhaseState(heart)!.burrow && guard++ < 60 * 12) stepTick(engine);
            expect(peekPhaseState(heart)!.burrow).toBeNull();
        };
        retreatTo(retreatFraction(2));
        retreatTo(retreatFraction(3));
        expect(GARDEN_PHASE_SPROUT_POINTS[3].some((p) => p.x === heart.x && p.y === heart.y)).toBe(true);

        const pond = GARDEN_PHASE_SPROUT_CELLS[4][0]!;
        expect(tm.getEffectiveTerrainType(pond.col, pond.row)).toBe(TerrainType.DeepWater);
        retreatTo(retreatFraction(4));
        expect([heart.x, heart.y]).toEqual([GARDEN_PHASE_SPROUT_POINTS[4][0]!.x, GARDEN_PHASE_SPROUT_POINTS[4][0]!.y]);

        // The island: every tile within the radius is grass.
        const r = GARDEN_POND_ISLAND_RADIUS_TILES;
        for (let dr = -r; dr <= r; dr++) {
            for (let dc = -r; dc <= r; dc++) {
                if (Math.hypot(dc, dr) > r) continue;
                expect(tm.getEffectiveTerrainType(pond.col + dc, pond.row + dr)).toBe(TerrainType.Grass);
            }
        }
        // The fords: 3 wide (the centre line and one each side), Shallow Water out to the shore; 2 off-line stays water.
        const walkable = (col: number, row: number) => tm.isPassable((col + 0.5) * CELL_SIZE, (row + 0.5) * CELL_SIZE);
        for (let step = r + 1; step <= 6; step++) {
            for (const side of [-1, 0, 1]) {
                expect(tm.getEffectiveTerrainType(pond.col + side, pond.row - step)).toBe(TerrainType.ShallowWater); // north
                expect(tm.getEffectiveTerrainType(pond.col - step, pond.row + side)).toBe(TerrainType.ShallowWater); // west
            }
            expect(walkable(pond.col, pond.row - step)).toBe(true);
            expect(walkable(pond.col - step, pond.row)).toBe(true);
        }
        expect(tm.getEffectiveTerrainType(pond.col + 2, pond.row - 5)).not.toBe(TerrainType.ShallowWater);
        // East and south stay open water.
        expect(tm.getEffectiveTerrainType(pond.col + 5, pond.row)).toBe(TerrainType.Water);
        expect(tm.getEffectiveTerrainType(pond.col, pond.row + 5)).toBe(TerrainType.Water);
        // The phase-4 tree grew on the island and fords, not in the water.
        // The tree is the plant kin: the darkness spawns (dark wolves) may have come in by now.
        const tree = engine.units.filter((u) => u.isAlive() && u.id !== heart.id && u.tags.includes(UnitTag.GardenKin));
        expect(tree).toHaveLength(gardenTreeLayout(4)!.length);
        for (const u of [heart, ...tree]) expect(tm.isPassable(u.x, u.y)).toBe(true);
        engine.destroy();
    });

    it('the resprout eruption is a reaction frame at the start of the rise, and its burst lands on a unit that stays', () => {
        const engine = initMission(GARDEN_HEART, { knowsReactions: true });
        const heart = heartOf(engine);
        const hero = engine.units.find((u) => u.isPlayerControlled())!;
        attachReflexIfKnown(hero, engine.eventBus, true);
        heart.takeDamage(heart.maxHp * 5, null, engine.eventBus);
        const burrow = peekPhaseState(heart)!.burrow!;

        const hpBefore = hero.hp;
        let reacted = false;
        let guard = 0;
        while (peekPhaseState(heart)!.burrow && guard++ < 60 * 12) {
            if (peekPhaseState(heart)!.burrow?.stage === 'travel') {
                // Park the hero on the sprout point so the circle covers it when the rise starts.
                hero.x = burrow.toX;
                hero.y = burrow.toY;
                hero.clearMovement();
            }
            if (engine.waitingForOrders && hero.reactionPending?.casterId === heart.id) {
                expect(hero.reactionPending.abilityId).toBe('garden_eruption');
                expect(peekPhaseState(heart)!.burrow?.stage).toBe('rise');
                reacted = true;
                engine.state.orderMgr.applyOrder({ unitId: hero.id, abilityId: 'wait', targets: [], endTurn: true });
                engine.tryResumeParallel();
            }
            stepTick(engine);
        }
        expect(reacted).toBe(true);
        expect(GARDEN_ERUPTION_RADIUS_PX).toBeGreaterThan(hero.radius);
        expect(hero.hp).toBeLessThan(hpBefore); // passing is free, so the burst landed
        engine.destroy();
    });
});
