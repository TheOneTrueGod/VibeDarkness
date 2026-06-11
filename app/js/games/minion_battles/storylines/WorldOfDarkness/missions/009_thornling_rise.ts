/**
 * Thornling Rise — test mission for the multiple-units-in-one-stack feature.
 *
 * Terrain: two segments side by side (44×22):
 *   [48_52 thorn path 2 | 49_52 thorn path]
 *
 * A damageable thornling nest sits on 49_52 at NEST_POINT_1.
 * Each round, two stacks of thornlings (stackSize 5) and two stacks of wolves
 * (stackSize 6) spawn anywhere within the 48_52 segment and hunt the players.
 * No objectives — the map does not end.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import type { BattleObjectiveDef, EnemySpawnDef, LevelEvent, PlayerSpawnPoint } from '../../types';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { MAP_SEGMENT_49_52_THORN_PATH, NEST_POINT_1 } from '../MapSegments/49_52_thorn_path';
import { MAP_SEGMENT_48_52_THORN_PATH_2 } from '../MapSegments/48_52_thorn_path_2';
import { getTerrainForSegment } from '../../../terrain/segmentRegistry';

// ---------------------------------------------------------------------------
// Grid constants
// ---------------------------------------------------------------------------
const COLS = 44;
const ROWS = 22;

/** Left segment: 48_52 thorn path 2. */
const SEG_48_52_COL = 0;
const SEG_48_52_ROW = 0;

/** Right segment: 49_52 thorn path. */
const SEG_49_52_COL = 22;
const SEG_49_52_ROW = 0;

const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;

function gridToWorld(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
}

function createTerrain(): TerrainGrid {
    const stitched = stitchTerrain(
        [[
            getTerrainForSegment('48_52_thorn_path_2', MAP_SEGMENT_48_52_THORN_PATH_2),
            getTerrainForSegment('49_52_thorn_path', MAP_SEGMENT_49_52_THORN_PATH),
        ]],
        TerrainType.Grass,
    );
    return TerrainGrid.createTerrainFromArray(COLS, ROWS, CELL_SIZE, stitched, TerrainType.Grass);
}

// ---------------------------------------------------------------------------
// Key positions
// ---------------------------------------------------------------------------

/** Thornling nest — 49_52 NEST_POINT_1 in global coords. */
const NEST_COL = SEG_49_52_COL + NEST_POINT_1.col;   // 22 + 11 = 33
const NEST_ROW = SEG_49_52_ROW + NEST_POINT_1.row;   // 0  + 13 = 13
const NEST_WORLD = gridToWorld(NEST_COL, NEST_ROW);

/** Center of 48_52 in world space — spawn target for enemies. */
const SPAWN_SEGMENT_CENTER_X = (SEG_48_52_COL + 11) * CELL_SIZE + CELL_SIZE / 2;
const SPAWN_SEGMENT_CENTER_Y = (SEG_48_52_ROW + 11) * CELL_SIZE + CELL_SIZE / 2;

// ---------------------------------------------------------------------------
// Mission class
// ---------------------------------------------------------------------------
export class ThornlingRiseMission extends BaseMissionDef {
    static readonly missionId = 'thornling_rise';
    static readonly nameStr = 'Thornling Rise';

    campaignId = 'world_of_darkness';
    segmentIds = ['48_52_thorn_path_2', '49_52_thorn_path'];

    missionId = ThornlingRiseMission.missionId;
    name = ThornlingRiseMission.nameStr;
    worldWidth = WORLD_WIDTH;
    worldHeight = WORLD_HEIGHT;

    battleObjectives: BattleObjectiveDef[] = [];

    enemies: EnemySpawnDef[] = [];

    levelEvents: LevelEvent[] = [
        // Spawn the thornling nest on 49_52 at the nest site at the start of round 1.
        {
            type: 'spawnWave' as const,
            trigger: { atRound: 1 },
            spawns: [
                {
                    characterId: 'thornling_nest',
                    name: 'Thornling Nest',
                    spawnBehaviour: 'anywhere' as const,
                    spawnTarget: { x: NEST_WORLD.x, y: NEST_WORLD.y, radius: 2 },
                    spawnCount: 1,
                },
            ],
        },
        // Two stacks of thornlings (5 per stack) every round, spawning within 48_52.
        {
            type: 'continuousSpawn' as const,
            trigger: { intervalRounds: 1 },
            spawns: [
                {
                    characterId: 'thornling',
                    name: 'Thornling',
                    spawnBehaviour: 'anywhere' as const,
                    spawnTarget: {
                        x: SPAWN_SEGMENT_CENTER_X,
                        y: SPAWN_SEGMENT_CENTER_Y,
                        radius: 11,
                    },
                    spawnCount: 2,
                    stackSize: 5,
                    unitAITreeId: 'hunt',
                },
            ],
        },
        // Two stacks of wolves (6 per stack) every round, spawning within 48_52.
        {
            type: 'continuousSpawn' as const,
            trigger: { intervalRounds: 1 },
            spawns: [
                {
                    characterId: 'dark_wolf',
                    name: 'Wolf',
                    spawnBehaviour: 'anywhere' as const,
                    spawnTarget: {
                        x: SPAWN_SEGMENT_CENTER_X,
                        y: SPAWN_SEGMENT_CENTER_Y,
                        radius: 11,
                    },
                    spawnCount: 2,
                    stackSize: 6,
                    unitAITreeId: 'hunt',
                },
            ],
        },
    ];

    createTerrain = createTerrain;

    // Players spawn in the right portion of 49_52 (grass tiles, global coords).
    playerSpawnPoints: PlayerSpawnPoint[] = [
        { col: 40, row: 3 },
        { col: 41, row: 3 },
        { col: 42, row: 3 },
        { col: 36, row: 5 },
        { col: 37, row: 5 },
        { col: 38, row: 5 },
    ];

    lightLevelEnabled = true;
    globalLightLevel = 10;
}

export const THORNLING_RISE = new ThornlingRiseMission();
