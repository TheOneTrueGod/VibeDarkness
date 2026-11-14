/**
 * The Court Magician — castle boss fight (held in Chapter 0, Unused Missions, until it is placed).
 * Arena: the 0_0 dirt circle, entered from the west road like the Displacer fight. The magician waits
 * at the centre between two dark crystals and conjures more as he is hurt (one per 10% lost, down to
 * 50%); he fights through them (Rearrange, Shard Nova, Crystal Volley), blinks away when cornered and,
 * enraged, stops time for the Crystal Laser.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import { NINJUTSU_DISABLED } from '../../../game/ninjutsu/ninjutsuConfig';
import { DarknessLevel } from '../../../game/darknessLevels';
import type { BattleObjectiveDef, EnemySpawnDef, LevelEvent, PlayerSpawnPoint } from '../../types';
import { ENEMY_COURT_MAGICIAN } from '../../../constants/enemyConstants';
import { PARTY_BLOCK_OFFSETS } from '../../missionSpawnHelpers';
import {
    COURT_CRYSTAL_COUNT,
    COURT_CRYSTAL_START_RADIUS_TILES,
    courtMagicianBossSetup,
} from './castle/castleBosses';
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

import { chapter0Scripts } from '../../../../../storylines/worldOfDarkness/chapter0.script';

export const COURT_MAGICIAN_MISSION_ID = 'court_magician';
export const COURT_MAGICIAN_MISSION_NAME = chapter0Scripts.court_magician.name;

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

/** The magician, his crystal ring and the defeat objective, centred on the arena (shared with the castle). */
const BOSS = courtMagicianBossSetup(
    BOSS_ARENA_CENTER,
    chapter0Scripts.court_magician.objectives.defeat_court_magician,
);

export { COURT_CRYSTAL_COUNT, COURT_CRYSTAL_START_RADIUS_TILES };

/** Starting crystal tiles: an even ring around the centre (opposite sides for two). */
export const COURT_CRYSTAL_START_TILES: readonly { col: number; row: number }[] = BOSS.crystalTiles;

/** Party arrives on the west road, as in the Displacer fight (a 4x2 block, nearest first). */
export const COURT_MAGICIAN_PLAYER_SPAWN_POINTS: readonly { col: number; row: number }[] = PARTY_BLOCK_OFFSETS.map(
    ([dc, dr]) => ({ col: ARENA_OUTSIDE_ROAD.col + 2 + dc, row: ARENA_OUTSIDE_ROAD.row + 2 + dr }),
);

const LEVEL_EVENTS: LevelEvent[] = [
    {
        type: 'victoryCheck',
        trigger: { afterRound: 0 },
        conditions: [{ type: 'unitDead', unitCharacterId: ENEMY_COURT_MAGICIAN.characterId }],
        missionResult: 'victory',
    },
];

const BATTLE_OBJECTIVES: BattleObjectiveDef[] = BOSS.objectives;

export class CourtMagicianMission extends BaseMissionDef {
    segmentIds = [BOSS_ARENA_SEGMENT_ID];

    missionId = COURT_MAGICIAN_MISSION_ID;
    campaignId = 'world_of_darkness';
    name = COURT_MAGICIAN_MISSION_NAME;
    /** Chapter 0 grid — row 0, col 2 (next free slot). */
    mapPosition = { x: WOD_CH0_MAP_X_COL2, y: WOD_CH0_MAP_Y_ROW0 };
    missionType = 'boss' as const;
    description = chapter0Scripts.court_magician.description;
    worldWidth = COLS * CELL_SIZE;
    worldHeight = ROWS * CELL_SIZE;
    enemies: EnemySpawnDef[] = BOSS.enemies;
    levelEvents: LevelEvent[] = LEVEL_EVENTS;
    battleObjectives = BATTLE_OBJECTIVES;
    createTerrain = createTerrain;
    lightLevelEnabled = true;
    globalLightLevel = DarknessLevel.BRIGHT_LIGHT;
    ninjutsuPools = { shadow: NINJUTSU_DISABLED };
    playerSpawnPoints: PlayerSpawnPoint[] = COURT_MAGICIAN_PLAYER_SPAWN_POINTS.map((p) => ({ ...p }));
}

export const COURT_MAGICIAN_MISSION = new CourtMagicianMission();
