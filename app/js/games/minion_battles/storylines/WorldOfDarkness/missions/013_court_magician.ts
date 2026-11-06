/**
 * The Court Magician — castle boss fight (held in Chapter 0, Unused Missions, until it is placed).
 * Arena: the 0_0 dirt circle, entered from the west road like the Displacer fight. The magician waits
 * at the centre inside a hexagon of six dark crystals; he fights through them (Rearrange, Shard Nova,
 * Crystal Volley), blinks away when cornered and, enraged, stops time for the Crystal Laser.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import { ObjectiveType } from '../../objectiveTypes';
import { NINJUTSU_DISABLED } from '../../../game/ninjutsu/ninjutsuConfig';
import { DarknessLevel } from '../../../game/darknessLevels';
import type { BattleObjectiveDef, EnemySpawnDef, LevelEvent, PlayerSpawnPoint } from '../../types';
import { ENEMY_COURT_CRYSTAL, ENEMY_COURT_MAGICIAN } from '../../../constants/enemyConstants';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { getTerrainForSegment } from '../../../terrain/segmentRegistry';
import { WOD_CH0_MAP_X_COL2, WOD_CH0_MAP_Y_ROW0 } from '../chapter0Map';
import {
    MAP_SEGMENT_0_0_BOSS_ARENA,
    BOSS_ARENA_SEGMENT_ID,
    BOSS_ARENA_SIZE,
    BOSS_ARENA_CENTER,
    ARENA_OUTSIDE_ROAD,
} from '../MapSegments/0_0_boss_arena';

export const COURT_MAGICIAN_MISSION_ID = 'court_magician';
export const COURT_MAGICIAN_MISSION_NAME = 'The Court Magician';

const COLS = BOSS_ARENA_SIZE;
const ROWS = BOSS_ARENA_SIZE;

const _ = TerrainType.Grass;

function createTerrain(): TerrainGrid {
    const stitched = stitchTerrain(
        [[getTerrainForSegment(BOSS_ARENA_SEGMENT_ID, MAP_SEGMENT_0_0_BOSS_ARENA)]],
        _,
    );
    return TerrainGrid.createTerrainFromArray(COLS, ROWS, CELL_SIZE, stitched, _);
}

function gridToWorld(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
}

/** Crystals the magician starts with. */
export const COURT_CRYSTAL_COUNT = 6;
/** Radius (tiles) of the starting crystal hexagon around the centre. */
export const COURT_CRYSTAL_START_RADIUS_TILES = 4;

/** Starting crystal tiles: a hexagon around the centre, points at 30°, 90°, ... (clear of the rocks). */
export const COURT_CRYSTAL_START_TILES: readonly { col: number; row: number }[] = Array.from(
    { length: COURT_CRYSTAL_COUNT },
    (_, i) => {
        // Turned 30° so no point lands on the arena's interior rocks.
        const a = ((i + 0.5) / COURT_CRYSTAL_COUNT) * Math.PI * 2;
        return {
            col: BOSS_ARENA_CENTER.col + Math.round(Math.cos(a) * COURT_CRYSTAL_START_RADIUS_TILES),
            row: BOSS_ARENA_CENTER.row + Math.round(Math.sin(a) * COURT_CRYSTAL_START_RADIUS_TILES),
        };
    },
);

/** Party arrives on the west road, as in the Displacer fight (a 4x2 block, nearest first). */
export const COURT_MAGICIAN_PLAYER_SPAWN_POINTS: readonly { col: number; row: number }[] = [
    [0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [-1, 1], [2, 0], [2, 1],
].map(([dc, dr]) => ({ col: ARENA_OUTSIDE_ROAD.col + 2 + dc!, row: ARENA_OUTSIDE_ROAD.row + 2 + dr! }));

const MAGICIAN: EnemySpawnDef = {
    ...ENEMY_COURT_MAGICIAN,
    position: gridToWorld(BOSS_ARENA_CENTER.col, BOSS_ARENA_CENTER.row),
};

const CRYSTALS: EnemySpawnDef[] = COURT_CRYSTAL_START_TILES.map((t) => ({
    ...ENEMY_COURT_CRYSTAL,
    position: gridToWorld(t.col, t.row),
}));

const LEVEL_EVENTS: LevelEvent[] = [
    {
        type: 'victoryCheck',
        trigger: { afterRound: 0 },
        conditions: [{ type: 'unitDead', unitCharacterId: ENEMY_COURT_MAGICIAN.characterId }],
        missionResult: 'victory',
    },
];

const BATTLE_OBJECTIVES: BattleObjectiveDef[] = [
    {
        id: 'defeat_court_magician',
        objectiveType: ObjectiveType.KillTarget,
        label: 'Defeat the Court Magician',
        toComplete: { type: 'unitDead', unitCharacterId: ENEMY_COURT_MAGICIAN.characterId },
    },
];

export class CourtMagicianMission extends BaseMissionDef {
    segmentIds = [BOSS_ARENA_SEGMENT_ID];

    missionId = COURT_MAGICIAN_MISSION_ID;
    campaignId = 'world_of_darkness';
    name = COURT_MAGICIAN_MISSION_NAME;
    /** Chapter 0 grid — row 0, col 2 (next free slot). */
    mapPosition = { x: WOD_CH0_MAP_X_COL2, y: WOD_CH0_MAP_Y_ROW0 };
    missionType = 'boss' as const;
    description =
        'A robed figure waits in the circle, dark crystals turning slowly around him. They move when he moves his hands.';
    worldWidth = COLS * CELL_SIZE;
    worldHeight = ROWS * CELL_SIZE;
    enemies: EnemySpawnDef[] = [MAGICIAN, ...CRYSTALS];
    levelEvents: LevelEvent[] = LEVEL_EVENTS;
    battleObjectives = BATTLE_OBJECTIVES;
    createTerrain = createTerrain;
    lightLevelEnabled = true;
    globalLightLevel = DarknessLevel.BRIGHT_LIGHT;
    ninjutsuPools = { shadow: NINJUTSU_DISABLED };
    playerSpawnPoints: PlayerSpawnPoint[] = COURT_MAGICIAN_PLAYER_SPAWN_POINTS.map((p) => ({ ...p }));
}

export const COURT_MAGICIAN_MISSION = new CourtMagicianMission();
