/**
 * The Garden Heart mission: it loads the 2x2 arena, spawns the Heart with its phase-1 tree, the authored sprout points
 * line up with passable ground, and a retreat runs end to end (crossing 75% burrows the Heart, the old tree dies to
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
import { GARDEN_HEART, GARDEN_HEART_MISSION_ID, GARDEN_LIGHT_BOOST } from '../020_garden_heart';
import { CRYSTAL_TILE_DEFAULTS, DARK_CRYSTAL_TILE_DEFAULTS } from '../../MapSegments/50_50_crystal_cave';
import { castlePoi, castlePoiCell, type CastleMission } from './castleMission';
import { SEGMENT_62_47_QUEENS_GARDEN } from '../../MapSegments/castle/62_47_queens_garden';
import {
    GARDEN_ARENA_SPROUT_SEGMENTS,
    GARDEN_ERUPTION_RADIUS_PX,
    GARDEN_SPROUT_POINTS,
} from '../../../../card_defs/16_enemy_garden_heart/gardenHeartPhases';
import { ENEMY_GARDEN_HEART } from '../../../../constants/enemyConstants';
import { getNodeChildIds } from '../../../../game/units/components/nodeTree';
import { gardenTreeLayout } from '../../../../game/gardenHeart/gardenTreeLayouts';
import { peekPhaseState } from '../../../../game/units/components/phaseComponent';
import { attachReflexIfKnown } from '../../../../resources/Reflex';
import { getBattleVariable } from '../../../../game/battleVariables';
import { GARDEN_GROWTH_PHASE_VARIABLE } from '../../../../card_defs/16_enemy_garden_heart/gardenHeartConstants';
import { KNOWLEDGE_REACTIONS } from '../../../../../../accountKnowledge';
import type { Unit } from '../../../../game/units/Unit';
import '../../../../abilities/AbilityRegistry';

registerWorldOfDarknessSegments();

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

    it('authored sprout points are passable ground inside their own segment of the composed map', () => {
        const mission = GARDEN_HEART;
        const grid = mission.createTerrain();
        const placements = mission.composeMap()!.placements;
        expect(GARDEN_ARENA_SPROUT_SEGMENTS.map((s) => s.segmentId)).toEqual(ARENA_IDS);
        let n = 0;
        for (const seg of GARDEN_ARENA_SPROUT_SEGMENTS) {
            const placement = placements.find((p) => p.id === seg.segmentId)!;
            for (const c of seg.cells) {
                const global = castlePoiCell(mission.rooms, { id: seg.segmentId, col: c.col, row: c.row, room: seg.segmentId });
                expect(global).toEqual({ col: placement.originCol + c.col, row: placement.originRow + c.row });
                const point = GARDEN_SPROUT_POINTS[n++]!;
                expect(point).toEqual({ x: (global.col + 0.5) * CELL_SIZE, y: (global.row + 0.5) * CELL_SIZE });
                expect(grid.isPassable(point.x, point.y)).toBe(true);
                expect([TerrainType.Grass, TerrainType.Dirt, TerrainType.ThickGrass]).toContain(grid.get(global.col, global.row));
            }
        }
        expect(n).toBe(GARDEN_SPROUT_POINTS.length);
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
        engine.destroy();
    });

    it('rings the pond with corrupted crystal lights, four-way symmetric, on open ground', () => {
        const engine = initMission(GARDEN_HEART);
        const grid = GARDEN_HEART.createTerrain();
        const crystals = engine.specialTiles.filter((t) => t.defId === 'DarkCrystal');
        expect(crystals).toHaveLength(12);
        const cells = new Set(crystals.map((t) => `${t.col}:${t.row}`));
        for (const t of crystals) {
            expect(t.emitsLight).toMatchObject({
                lightType: 'DarkLight',
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

    it('a retreat at 75%: clamped hit, the old tree dies to Briar, the Heart resurfaces with the phase-2 tree', () => {
        const engine = initMission(GARDEN_HEART);
        const heart = heartOf(engine);
        const maxHp = heart.maxHp;
        const oldTree = engine.units.filter((u) => u.id !== heart.id && u.teamId === 'enemy');
        expect(oldTree.length).toBeGreaterThan(0);
        const briarBefore = countBriar(engine);

        heart.takeDamage(maxHp * 5, null, engine.eventBus);
        expect(heart.hp).toBe(maxHp * 0.75);
        expect(peekPhaseState(heart)!.burrow?.stage).toBe('close');
        const burrow = peekPhaseState(heart)!.burrow!;
        expect(GARDEN_SPROUT_POINTS.some((p) => p.x === burrow.toX && p.y === burrow.toY)).toBe(true);

        let guard = 0;
        while (peekPhaseState(heart)!.burrow && guard++ < 60 * 12) stepTick(engine);
        expect(peekPhaseState(heart)!.burrow).toBeNull();
        expect([heart.x, heart.y]).toEqual([burrow.toX, burrow.toY]);
        expect(heart.hp).toBe(maxHp * 0.75);

        for (const u of oldTree) expect(u.isAlive()).toBe(false);
        expect(countBriar(engine)).toBeGreaterThan(briarBefore);

        const phase2 = gardenTreeLayout(2)!;
        const fresh = engine.units.filter((u) => u.isAlive() && u.teamId === 'enemy' && u.id !== heart.id);
        expect(fresh).toHaveLength(phase2.length);
        expect(getNodeChildIds(heart)).toHaveLength(phase2.filter((s) => s.parent === null).length);
        expect(fresh.some((u) => u.characterId === 'pod_mortar')).toBe(true); // phase 2 = Thornspitter + Pod Mortar
        for (const u of fresh) expect(Math.hypot(u.x - heart.x, u.y - heart.y)).toBeLessThan(10 * CELL_SIZE);
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
