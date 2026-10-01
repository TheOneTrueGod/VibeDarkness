/**
 * Swarmling Source — slot 1 smoke (map goal + cave-mouth opening pack).
 */

import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { getMissionSegmentZones } from '../../../terrain/segmentRegistry';
import { isTileInZone } from '../../../terrain/zones';
import { getNearPositionAreaTiles } from '../../nearPositionArea';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import {
    QUEST_PUSH_NORTH,
    QUEST_PUSH_NORTH_GOAL_HEIGHT,
    QUEST_PUSH_NORTH_GOAL_WIDTH,
    QUEST_PUSH_NORTH_MISSION_ID,
    QUEST_PUSH_NORTH_NAME,
    QUEST_PUSH_NORTH_OBJECTIVE_LABEL,
    QUEST_PUSH_NORTH_SLIME_MAX_UNITS,
    QUEST_PUSH_NORTH_SLIME_SPAWN_COUNT,
    QUEST_PUSH_NORTH_SWARMLING_SPAWN_COUNT,
    QUEST_PUSH_NORTH_SPAWN_RADIUS_TILES,
    QUEST_PUSH_NORTH_START_SWARMLING_COUNT,
    QUEST_PUSH_NORTH_START_PACK_COUNT,
    QUEST_PUSH_NORTH_CAMPFIRE_PACK_RADIUS_TILES,
    QUEST_PUSH_NORTH_START_WOLF_COUNT,
    QUEST_PUSH_NORTH_WOLF_MAX_UNITS,
    QUEST_PUSH_NORTH_WOLF_SPAWN_COUNT,
} from './quest_push_north';

registerWorldOfDarknessSegments();

describe('quest_push_north', () => {
    it('uses a unique quest mission id and north-reach victory', () => {
        expect(QUEST_PUSH_NORTH.missionId).toBe(QUEST_PUSH_NORTH_MISSION_ID);
        expect(QUEST_PUSH_NORTH.name).toBe(QUEST_PUSH_NORTH_NAME);
        expect(QUEST_PUSH_NORTH.mapPosition).toBeUndefined();
        const reach = QUEST_PUSH_NORTH.battleObjectives?.find((o) => o.id === 'reach_north');
        expect(reach?.label).toBe(QUEST_PUSH_NORTH_OBJECTIVE_LABEL);
        expect(reach?.toComplete).toEqual({
            type: 'allUnitsNearPosition',
            col: expect.any(Number),
            row: expect.any(Number),
            width: QUEST_PUSH_NORTH_GOAL_WIDTH,
            height: QUEST_PUSH_NORTH_GOAL_HEIGHT,
        });
    });

    it('places FireLight campfires on the 50_49 cliff path', () => {
        const cliffCampfires = (QUEST_PUSH_NORTH.specialTiles ?? []).filter(
            (t) => t.defId === 'Campfire' && (t.row === 21 || t.row === 13),
        );
        expect(cliffCampfires).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    col: 8,
                    row: 21,
                    emitsLight: expect.objectContaining({ lightType: 'FireLight' }),
                }),
                expect.objectContaining({
                    col: 14,
                    row: 13,
                    emitsLight: expect.objectContaining({ lightType: 'FireLight' }),
                }),
            ]),
        );
    });

    it('opens with three packs (1 wolf + 2 swarmlings each): cave mouth and both campfires', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 42 });
        const terrain = QUEST_PUSH_NORTH.createTerrain();
        const terrainManager = new TerrainManager(terrain);
        const zones = getMissionSegmentZones(QUEST_PUSH_NORTH.segmentIds);
        const caveMouthZone = zones.find((z) => z.id === 'outside of cave mouth');
        expect(caveMouthZone).toBeDefined();

        QUEST_PUSH_NORTH.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'] },
            terrainManager,
            terrainSegmentZones: zones,
        });

        const wolves = engine.units.filter((u) => u.characterId === 'dark_wolf');
        const swarmlings = engine.units.filter((u) => u.characterId === 'swarmling');
        expect(wolves).toHaveLength(
            QUEST_PUSH_NORTH_START_WOLF_COUNT * QUEST_PUSH_NORTH_START_PACK_COUNT,
        );
        expect(swarmlings).toHaveLength(
            QUEST_PUSH_NORTH_START_SWARMLING_COUNT * QUEST_PUSH_NORTH_START_PACK_COUNT,
        );
        expect(engine.units.some((u) => u.characterId === 'boar')).toBe(false);

        const cellSize = terrain.cellSize;
        const packSize = QUEST_PUSH_NORTH_START_WOLF_COUNT + QUEST_PUSH_NORTH_START_SWARMLING_COUNT;
        const all = [...wolves, ...swarmlings];
        const tileOf = (u: { x: number; y: number }) => ({
            col: Math.floor(u.x / cellSize),
            row: Math.floor(u.y / cellSize),
        });
        const inCaveMouth = all.filter((u) => {
            const { col, row } = tileOf(u);
            return isTileInZone(caveMouthZone!, col, row);
        });
        expect(inCaveMouth).toHaveLength(packSize);
        for (const campfire of [
            { col: 8, row: 21 },
            { col: 14, row: 13 },
        ]) {
            const near = all.filter((u) => {
                const { col, row } = tileOf(u);
                return (
                    Math.max(Math.abs(col - campfire.col), Math.abs(row - campfire.row))
                    <= QUEST_PUSH_NORTH_CAMPFIRE_PACK_RADIUS_TILES
                );
            });
            expect(near).toHaveLength(packSize);
        }
        for (const unit of all) expect(unit.spawnTimer).toBe(0);

        engine.destroy();
    });

    it('reinforces from the northern spawn target at double light_empowered rates', () => {
        const events = QUEST_PUSH_NORTH.levelEvents ?? [];
        const wolf = events.find(
            (e) =>
                e.type === 'continuousSpawn'
                && e.spawns?.[0]?.characterId === 'dark_wolf',
        );
        const slime = events.find(
            (e) =>
                e.type === 'continuousSpawn'
                && e.spawns?.[0]?.characterId === 'slime',
        );
        expect(wolf?.type).toBe('continuousSpawn');
        expect(slime?.type).toBe('continuousSpawn');
        if (wolf?.type !== 'continuousSpawn' || slime?.type !== 'continuousSpawn') return;

        expect(wolf.maxUnits).toBe(QUEST_PUSH_NORTH_WOLF_MAX_UNITS);
        expect(slime.maxUnits).toBe(QUEST_PUSH_NORTH_SLIME_MAX_UNITS);
        expect(wolf.spawns[0]?.spawnCount).toBe(QUEST_PUSH_NORTH_WOLF_SPAWN_COUNT);
        expect(slime.spawns[0]?.spawnCount).toBe(QUEST_PUSH_NORTH_SLIME_SPAWN_COUNT);
        expect(wolf.spawns[1]?.characterId).toBe('swarmling');
        expect(wolf.spawns[1]?.spawnCount).toBe(QUEST_PUSH_NORTH_SWARMLING_SPAWN_COUNT);
        expect(wolf.spawns[0]?.spawnTarget?.radius).toBe(QUEST_PUSH_NORTH_SPAWN_RADIUS_TILES);
        expect(slime.spawns[0]?.spawnTarget?.radius).toBe(QUEST_PUSH_NORTH_SPAWN_RADIUS_TILES);
    });

    it('marks all 6 goal tiles with faint footprints until the objective completes', () => {
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 42 });
        engine.registerBattleObjectives(QUEST_PUSH_NORTH.battleObjectives ?? []);

        const markers = engine.getObjectiveTileMarkers();
        expect(markers).toHaveLength(1);
        const area = QUEST_PUSH_NORTH_GOAL_WIDTH * QUEST_PUSH_NORTH_GOAL_HEIGHT;
        expect(markers[0]!.tiles).toHaveLength(area);
        expect(markers[0]!.image).toBe('footprint');
        expect(markers[0]!.alpha).toBeLessThan(0.5);

        engine.destroy();
    });

    it('has a walkable 3x2 goal block', () => {
        const terrainManager = new TerrainManager(QUEST_PUSH_NORTH.createTerrain());
        const reach = QUEST_PUSH_NORTH.battleObjectives?.find((o) => o.id === 'reach_north');
        if (reach?.toComplete.type !== 'allUnitsNearPosition') throw new Error('unexpected condition');
        const tiles = getNearPositionAreaTiles(reach.toComplete);
        expect(tiles).toHaveLength(6);
        const cell = terrainManager.grid.cellSize;
        for (const { col, row } of tiles) {
            expect(terrainManager.isPassable(col * cell + cell / 2, row * cell + cell / 2)).toBe(true);
        }
    });
});
