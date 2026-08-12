/**
 * Quest: Find the herd of boars — slot 1 smoke (map goal + cave-mouth opening pack).
 */

import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { getMissionSegmentZones } from '../../../terrain/segmentRegistry';
import { isTileInZone } from '../../../terrain/zones';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import {
    QUEST_BOAR_HERD_NORTH,
    QUEST_BOAR_HERD_NORTH_GOAL_MAX_DISTANCE,
    QUEST_BOAR_HERD_NORTH_MISSION_ID,
    QUEST_BOAR_HERD_NORTH_SLIME_MAX_UNITS,
    QUEST_BOAR_HERD_NORTH_SLIME_SPAWN_COUNT,
    QUEST_BOAR_HERD_NORTH_SPAWN_RADIUS_TILES,
    QUEST_BOAR_HERD_NORTH_START_SWARMLING_COUNT,
    QUEST_BOAR_HERD_NORTH_START_WOLF_COUNT,
    QUEST_BOAR_HERD_NORTH_WOLF_MAX_UNITS,
    QUEST_BOAR_HERD_NORTH_WOLF_SPAWN_COUNT,
} from './quest_boar_herd_north';

registerWorldOfDarknessSegments();

describe('quest_boar_herd_north', () => {
    it('uses a unique quest mission id and north-reach victory', () => {
        expect(QUEST_BOAR_HERD_NORTH.missionId).toBe(QUEST_BOAR_HERD_NORTH_MISSION_ID);
        expect(QUEST_BOAR_HERD_NORTH.mapPosition).toBeUndefined();
        const reach = QUEST_BOAR_HERD_NORTH.battleObjectives?.find((o) => o.id === 'reach_north');
        expect(reach?.toComplete).toEqual({
            type: 'allUnitsNearPosition',
            col: expect.any(Number),
            row: expect.any(Number),
            maxDistance: QUEST_BOAR_HERD_NORTH_GOAL_MAX_DISTANCE,
        });
    });

    it('opens with 2 wolves and 4 swarmlings in the outside-cave-mouth box', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 42 });
        const terrain = QUEST_BOAR_HERD_NORTH.createTerrain();
        const terrainManager = new TerrainManager(terrain);
        const zones = getMissionSegmentZones(QUEST_BOAR_HERD_NORTH.segmentIds);
        const caveMouthZone = zones.find((z) => z.id === 'outside of cave mouth');
        expect(caveMouthZone).toBeDefined();

        QUEST_BOAR_HERD_NORTH.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'] },
            terrainManager,
            terrainSegmentZones: zones,
        });

        const wolves = engine.units.filter((u) => u.characterId === 'dark_wolf');
        const swarmlings = engine.units.filter((u) => u.characterId === 'swarmling');
        expect(wolves).toHaveLength(QUEST_BOAR_HERD_NORTH_START_WOLF_COUNT);
        expect(swarmlings).toHaveLength(QUEST_BOAR_HERD_NORTH_START_SWARMLING_COUNT);
        expect(engine.units.some((u) => u.characterId === 'boar')).toBe(false);

        const cellSize = terrain.cellSize;
        for (const unit of [...wolves, ...swarmlings]) {
            const col = Math.floor(unit.x / cellSize);
            const row = Math.floor(unit.y / cellSize);
            expect(isTileInZone(caveMouthZone!, col, row)).toBe(true);
            expect(unit.spawnTimer).toBe(0);
        }

        engine.destroy();
    });

    it('reinforces from the northern spawn target at double light_empowered rates', () => {
        const events = QUEST_BOAR_HERD_NORTH.levelEvents ?? [];
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

        expect(wolf.maxUnits).toBe(QUEST_BOAR_HERD_NORTH_WOLF_MAX_UNITS);
        expect(slime.maxUnits).toBe(QUEST_BOAR_HERD_NORTH_SLIME_MAX_UNITS);
        expect(wolf.spawns[0]?.spawnCount).toBe(QUEST_BOAR_HERD_NORTH_WOLF_SPAWN_COUNT);
        expect(slime.spawns[0]?.spawnCount).toBe(QUEST_BOAR_HERD_NORTH_SLIME_SPAWN_COUNT);
        expect(wolf.spawns[0]?.spawnTarget?.radius).toBe(QUEST_BOAR_HERD_NORTH_SPAWN_RADIUS_TILES);
        expect(slime.spawns[0]?.spawnTarget?.radius).toBe(QUEST_BOAR_HERD_NORTH_SPAWN_RADIUS_TILES);
    });
});
