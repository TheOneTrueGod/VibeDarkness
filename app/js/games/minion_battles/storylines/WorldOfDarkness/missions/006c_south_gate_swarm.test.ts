import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import {
    OPENING_SWARMLING_COUNT,
    OPENING_WOLF_COUNT,
    NEST_GUARD_SLIME_COUNT,
    NEST_GUARD_WOLF_COUNT,
    SOUTH_GATE_SWARM,
    SWARM_NEST_SPAWN_COUNT,
    SWARM_NEST_SPAWN_INTERVAL_SEC,
} from './006c_south_gate_swarm';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { getMissionSegmentZones } from '../../../terrain/segmentRegistry';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import { isTileInZone } from '../../../terrain/zones';
import { SWARM_NEST_CHARACTER_ID } from '../../../game/lanternite/swarmNestTick';
import { ROUND_DURATION } from '../../../game/gameConstants';
import { OUTSIDE_CAVE_MOUTH_ZONE } from '../MapSegments/50_50_crystal_cave';

registerWorldOfDarknessSegments();

describe('SouthGateSwarmMission', () => {
    it('pre-spawns opening pack in the outside-cave-mouth zone plus a thornbinder left of the box', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 42 });
        const terrain = SOUTH_GATE_SWARM.createTerrain();
        const terrainManager = new TerrainManager(terrain);
        const zones = getMissionSegmentZones(SOUTH_GATE_SWARM.segmentIds);
        const caveMouthZone = zones.find((z) => z.id === 'outside of cave mouth');
        expect(caveMouthZone).toBeDefined();

        SOUTH_GATE_SWARM.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'] },
            terrainManager,
            terrainSegmentZones: zones,
        });

        const wolvesInBox = engine.units.filter((u) => {
            if (u.characterId !== 'dark_wolf') return false;
            const col = Math.floor(u.x / terrain.cellSize);
            const row = Math.floor(u.y / terrain.cellSize);
            return isTileInZone(caveMouthZone!, col, row);
        });
        const swarmlingsInBox = engine.units.filter((u) => {
            if (u.characterId !== 'swarmling') return false;
            const col = Math.floor(u.x / terrain.cellSize);
            const row = Math.floor(u.y / terrain.cellSize);
            return isTileInZone(caveMouthZone!, col, row);
        });
        expect(wolvesInBox).toHaveLength(OPENING_WOLF_COUNT);
        expect(swarmlingsInBox).toHaveLength(OPENING_SWARMLING_COUNT);

        const thornbinder = engine.units.find((u) => u.characterId === 'thornbinder');
        expect(thornbinder).toBeDefined();
        const tbCol = Math.floor(thornbinder!.x / terrain.cellSize);
        const tbRow = Math.floor(thornbinder!.y / terrain.cellSize);
        expect(tbCol).toBe(OUTSIDE_CAVE_MOUTH_ZONE.topLeft.col - 1);
        expect(tbRow).toBe(
            Math.floor(
                (OUTSIDE_CAVE_MOUTH_ZONE.topLeft.row + OUTSIDE_CAVE_MOUTH_ZONE.bottomRight.row) / 2,
            ),
        );

        engine.destroy();
    });

    it('pre-spawns a swarm nest with half-round swarmling pacing and nest-side guards', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 7 });
        const terrain = SOUTH_GATE_SWARM.createTerrain();
        const terrainManager = new TerrainManager(terrain);
        const zones = getMissionSegmentZones(SOUTH_GATE_SWARM.segmentIds);

        SOUTH_GATE_SWARM.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'] },
            terrainManager,
            terrainSegmentZones: zones,
        });

        const nest = engine.units.find((u) => u.characterId === SWARM_NEST_CHARACTER_ID);
        expect(nest).toBeDefined();
        expect(nest!.swarmState.nestConfig?.spawnCount).toBe(SWARM_NEST_SPAWN_COUNT);
        expect(nest!.swarmState.nestConfig?.spawnIntervalSec).toBe(SWARM_NEST_SPAWN_INTERVAL_SEC);
        expect(SWARM_NEST_SPAWN_INTERVAL_SEC).toBe(ROUND_DURATION / 2);

        // Opening box wolves + nest-guard wolves
        const wolves = engine.units.filter((u) => u.characterId === 'dark_wolf');
        expect(wolves.length).toBe(OPENING_WOLF_COUNT + NEST_GUARD_WOLF_COUNT);

        const slimes = engine.units.filter((u) => u.characterId === 'slime');
        expect(slimes).toHaveLength(NEST_GUARD_SLIME_COUNT);

        engine.destroy();
    });
});
