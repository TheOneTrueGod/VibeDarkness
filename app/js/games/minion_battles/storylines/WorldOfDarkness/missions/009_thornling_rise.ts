/**
 * Thornling Rise — test mission for the multiple-units-in-one-stack feature.
 *
 * Terrain: two segments side by side (44×22):
 *   [48_52 thorn path 2 | 49_52 thorn path]
 *
 * An allied thornling nest pre-spawns near the players and periodically births
 * thornlings (stackSize 1, allied). Enemy wolves (stackSize 6) spawn every round
 * from the 48_52 side. No objectives — the map does not end.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import type { BattleObjectiveDef, EnemySpawnDef, LevelEvent, PlayerSpawnPoint } from '../../types';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { MAP_SEGMENT_49_52_THORN_PATH } from '../MapSegments/49_52_thorn_path';
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

/**
 * Allied thornling nest — placed just south of the player spawn cluster in the
 * open grass area of 49_52 (local col 20, row 8 = global col 42, row 8).
 */
const NEST_COL = SEG_49_52_COL + 20;  // 42
const NEST_ROW = 8;
const NEST_WORLD = gridToWorld(NEST_COL, NEST_ROW);

/** Center of 48_52 in world space — spawn target for enemy wolves. */
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
    /** Row 3 (L→R): after Thorn March. */
    mapPosition = { x: 270, y: 550 };
    missionType = 'battle' as const;
    description = 'A thornling nest surges with new growth. Destroy it before the swarm overwhelms the region.';
    name = ThornlingRiseMission.nameStr;
    worldWidth = WORLD_WIDTH;
    worldHeight = WORLD_HEIGHT;

    battleObjectives: BattleObjectiveDef[] = [];

    enemies: EnemySpawnDef[] = [
        // Allied thornling nest — spawns up to 8 thornlings, 2 per interval every 12 seconds.
        {
            characterId: 'thornling_nest',
            name: 'Thornling Nest',
            position: NEST_WORLD,
            teamId: 'allied',
            abilities: [],
            aiSettings: { minRange: 0, maxRange: 0 },
            unitAITreeId: 'hunt',
            thornlingNest: {
                maxThornlings: 8,
                spawnIntervalSec: 12,
                spawnCount: 2,
                spawnCharacterId: 'thornling',
                spawnAbilities: ['0015'],
                spawnAITreeId: 'hunt',
            },
        },
    ];

    levelEvents: LevelEvent[] = [
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

    // Players spawn in the far-right corner of 49_52 (open grass tiles).
    playerSpawnPoints: PlayerSpawnPoint[] = [
        { col: 40, row: 3 },
        { col: 41, row: 3 },
        { col: 42, row: 3 },
        { col: 40, row: 5 },
        { col: 41, row: 5 },
        { col: 42, row: 5 },
    ];

    lightLevelEnabled = true;
    globalLightLevel = 10;
}

export const THORNLING_RISE = new ThornlingRiseMission();
