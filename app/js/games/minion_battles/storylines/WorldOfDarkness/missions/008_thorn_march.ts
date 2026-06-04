/**
 * Thorn March — M2 of the Lanternite arc.
 *
 * The first lanternite nest (already established at the end of M1) is pre-spawned in the west
 * glade and invulnerable. Its scouts will march south into the thorn path (49_52) to build the
 * second nest, then west into the second thorn section (48_52) to build the third. Only the
 * first nest is invulnerable; the other two can be attacked and must be defended.
 *
 * Terrain: 2×2 segment grid (each 22×22):
 *   [BLANK grass pad   | 49_51 west glade  ]
 *   [48_52 thorn path2 | 49_52 thorn path  ]
 *
 * Lanternite build path:
 *   Pre-spawned nest in 49_51 (invulnerable) → scouts build nest in 49_52 → scouts build nest in 48_52.
 *
 * Victory: all three lanternite nests remain alive through round 8.
 */

import type { GameEngine } from '../../../game/GameEngine';
import { BaseMissionDef, type InitializeGameStateParams } from '../../BaseMissionDef';
import type {
    BattleObjectiveDef,
    LevelEvent,
    PlayerSpawnPoint,
} from '../../types';
import type { MapSegmentPOI } from '../../../terrain/segmentSchema';
import type { PostMissionStoryDef, PreMissionStoryDef } from '../../storyTypes';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import {
    MAP_SEGMENT_49_51_WEST_GLADE,
    LANTERN_NEST_FOCUS,
} from '../MapSegments/49_51_west_glade';
import {
    MAP_SEGMENT_49_52_THORN_PATH,
    NEST_POINT_1 as THORN_NEST_POINT,
} from '../MapSegments/49_52_thorn_path';
import {
    MAP_SEGMENT_48_52_THORN_PATH_2,
    NEST as THORN2_NEST_POINT,
} from '../MapSegments/48_52_thorn_path_2';
import { getTerrainForSegment } from '../../../terrain/segmentRegistry';
import { LANTERNITE_NEST_CHARACTER_ID } from '../../../game/lanternite/lanternitePulse';

// ---------------------------------------------------------------------------
// Grid constants
// ---------------------------------------------------------------------------
const COLS = 44;
const ROWS = 44;

/** Top-right quadrant: 49_51 west glade. */
const SEG_49_51_COL = 22;
const SEG_49_51_ROW = 0;
/** Bottom-right quadrant: 49_52 thorn path. */
const SEG_49_52_COL = 22;
const SEG_49_52_ROW = 22;
/** Bottom-left quadrant: 48_52 thorn path 2. */
const SEG_48_52_COL = 0;
const SEG_48_52_ROW = 22;

const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;

/** 22×22 grass fill for the unused top-left quadrant (no segment exists at 48_51). */
const BLANK_22: TerrainType[][] = Array.from(
    { length: 22 },
    () => Array<TerrainType>(22).fill(TerrainType.Grass),
);

function createTerrain(): TerrainGrid {
    const stitched = stitchTerrain(
        [
            [
                BLANK_22,
                getTerrainForSegment('49_51_west_glade', MAP_SEGMENT_49_51_WEST_GLADE),
            ],
            [
                getTerrainForSegment('48_52_thorn_path_2', MAP_SEGMENT_48_52_THORN_PATH_2),
                getTerrainForSegment('49_52_thorn_path', MAP_SEGMENT_49_52_THORN_PATH),
            ],
        ],
        TerrainType.Grass,
    );
    return TerrainGrid.createTerrainFromArray(COLS, ROWS, CELL_SIZE, stitched, TerrainType.Grass);
}

function gridToWorld(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
}

// ---------------------------------------------------------------------------
// Nest site coordinates (global grid)
// ---------------------------------------------------------------------------

/** First nest site — 49_51 west glade, pre-spawned and invulnerable. */
const NEST_49_51_COL = SEG_49_51_COL + LANTERN_NEST_FOCUS.col;  // 22 + 7 = 29
const NEST_49_51_ROW = SEG_49_51_ROW + LANTERN_NEST_FOCUS.row;  // 0 + 15 = 15
const NEST_49_51_WORLD = gridToWorld(NEST_49_51_COL, NEST_49_51_ROW);

/** Second nest site — 49_52 thorn path. */
const NEST_49_52_COL = SEG_49_52_COL + THORN_NEST_POINT.col;    // 22 + 11 = 33
const NEST_49_52_ROW = SEG_49_52_ROW + THORN_NEST_POINT.row;    // 22 + 13 = 35
const NEST_49_52_WORLD = gridToWorld(NEST_49_52_COL, NEST_49_52_ROW);

/** Third nest site — 48_52 thorn path 2. */
const NEST_48_52_COL = SEG_48_52_COL + THORN2_NEST_POINT.col;   // 0 + 9 = 9
const NEST_48_52_ROW = SEG_48_52_ROW + THORN2_NEST_POINT.row;   // 22 + 8 = 30
const NEST_48_52_WORLD = gridToWorld(NEST_48_52_COL, NEST_48_52_ROW);

// ---------------------------------------------------------------------------
// Mission-specific POIs for the nest network
// ---------------------------------------------------------------------------
const MISSION_POIS: MapSegmentPOI[] = [
    {
        id: 'nest_49_51',
        label: 'West Glade Nest',
        col: NEST_49_51_COL,
        row: NEST_49_51_ROW,
        type: 'nest',
        tags: ['connects:nest_49_52'],
    },
    {
        id: 'nest_49_52',
        label: 'Thorn Path Nest',
        col: NEST_49_52_COL,
        row: NEST_49_52_ROW,
        type: 'nest',
        tags: ['connects:nest_49_51', 'connects:nest_48_52'],
    },
    {
        id: 'nest_48_52',
        label: 'Thorn Path Nest II',
        col: NEST_48_52_COL,
        row: NEST_48_52_ROW,
        type: 'nest',
        tags: ['connects:nest_49_52'],
    },
];

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------
const PRE_MISSION_STORY: PreMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'The nest in the glade still pulses with light—untouchable. But the lanternites are not staying. Small flames drift south into the thorns. Whatever they are building, they need you to follow.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
    ],
};

const POST_MISSION_STORY: PostMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'Three nests. Three lights in the dark. The lanternites have driven roots deep into the thorn path—and the darkness has not snuffed them out.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
    ],
};

// ---------------------------------------------------------------------------
// Mission class
// ---------------------------------------------------------------------------
export class ThornMarchMission extends BaseMissionDef {
    static readonly missionId = 'thorn_march';
    static readonly nameStr = 'Thorn March';

    campaignId = 'world_of_darkness';
    segmentIds = ['49_51_west_glade', '49_52_thorn_path', '48_52_thorn_path_2'];

    battleObjectives: BattleObjectiveDef[] = [
        {
            id: 'establish_all_nests',
            label: 'Protect the lanternites as they build their network',
            toComplete: { type: 'aliveUnitCount', characterId: LANTERNITE_NEST_CHARACTER_ID, minCount: 3 },
            onComplete: [{ type: 'revealObjective', id: 'hold_the_line' }],
            showObjectiveMarker: {
                enable: true,
                target: { type: 'position', x: NEST_49_52_WORLD.x, y: NEST_49_52_WORLD.y },
                showOffscreen: true,
            },
        },
        {
            id: 'hold_the_line',
            label: 'Hold all three nests for 2 more rounds',
            revealedInitially: false,
            requiresCompletedId: 'establish_all_nests',
            toComplete: { type: 'atLeastRound', round: 8 },
        },
    ];

    enemies = [
        // Pre-spawned first nest — invulnerable (invulnerabilityGenerations = 1).
        // Its children get generations = 0 and are NOT invulnerable.
        {
            characterId: LANTERNITE_NEST_CHARACTER_ID,
            name: 'Lanternite Nest',
            position: NEST_49_51_WORLD,
            teamId: 'allied' as const,
            abilities: [],
            aiSettings: { minRange: 0, maxRange: 0 },
            unitAITreeId: 'lanterniteNestIdle',
            invulnerabilityGenerations: 1,
            lanterniteNest: {
                maxLanternites: 4,
                spawnIntervalSec: 14,
                // patrolDestination is required by type but unused in networked mode
                patrolDestination: { kind: 'world' as const, x: NEST_49_51_WORLD.x, y: NEST_49_51_WORLD.y },
                networked: true,
                nestPoiId: 'nest_49_51',
                scoutConstructionSec: 12,
            },
        },
    ];

    levelEvents: LevelEvent[] = [
        // 2 wolves every round
        {
            type: 'continuousSpawn',
            trigger: { intervalRounds: 1 },
            spawns: [
                {
                    characterId: 'dark_wolf',
                    name: 'Wolf',
                    spawnBehaviour: 'closestEnemySpawnPoint',
                    spawnCount: 2,
                    unitAITreeId: 'hunt',
                },
            ],
        },
        // +1 wolf every other round (so 2 or 3 wolves per round)
        {
            type: 'continuousSpawn',
            trigger: { intervalRounds: 2 },
            spawns: [
                {
                    characterId: 'dark_wolf',
                    name: 'Wolf',
                    spawnBehaviour: 'closestEnemySpawnPoint',
                    spawnCount: 1,
                    unitAITreeId: 'hunt',
                },
            ],
        },
        // 2 swarmlings every round
        {
            type: 'continuousSpawn',
            trigger: { intervalRounds: 1 },
            spawns: [
                {
                    characterId: 'swarmling',
                    name: 'Swarmling',
                    spawnBehaviour: 'closestEnemySpawnPoint',
                    spawnCount: 2,
                    unitAITreeId: 'hunt',
                },
            ],
        },
        // +2 swarmlings every other round (so 2 or 4 swarmlings per round)
        {
            type: 'continuousSpawn',
            trigger: { intervalRounds: 2 },
            spawns: [
                {
                    characterId: 'swarmling',
                    name: 'Swarmling',
                    spawnBehaviour: 'closestEnemySpawnPoint',
                    spawnCount: 2,
                    unitAITreeId: 'hunt',
                },
            ],
        },
        // 1 slime every 2 rounds
        {
            type: 'continuousSpawn',
            trigger: { intervalRounds: 2 },
            spawns: [
                {
                    characterId: 'enemy_ranged',
                    name: 'Slime',
                    spawnBehaviour: 'closestEnemySpawnPoint',
                    spawnCount: 1,
                    unitAITreeId: 'hunt',
                },
            ],
        },
        // Victory: all three nests still alive after 8 rounds
        {
            type: 'victoryCheck',
            trigger: { afterRound: 8 },
            conditions: [{ type: 'aliveUnitCount', characterId: LANTERNITE_NEST_CHARACTER_ID, minCount: 3 }],
        },
        // Fallback check at round 10 if 3rd nest builds slowly
        {
            type: 'victoryCheck',
            trigger: { afterRound: 10 },
            conditions: [{ type: 'aliveUnitCount', characterId: LANTERNITE_NEST_CHARACTER_ID, minCount: 3 }],
        },
    ];

    missionId = ThornMarchMission.missionId;
    name = ThornMarchMission.nameStr;
    worldWidth = WORLD_WIDTH;
    worldHeight = WORLD_HEIGHT;
    aiController = 'defensePoints' as const;
    createTerrain = createTerrain;

    gatherPartyBackgroundImage = STORY_BACKGROUNDS.campfire;
    // Players spawn in the west glade near the first nest
    playerSpawnPoints: PlayerSpawnPoint[] = [{ col: 35, row: 8 }];

    lightLevelEnabled = true;
    globalLightLevel = 0;

    preMissionStory = PRE_MISSION_STORY;
    postMissionStory = POST_MISSION_STORY;

    override initializeGameState(engine: GameEngine, params: InitializeGameStateParams): void {
        super.initializeGameState(engine, {
            ...params,
            terrainSegmentPOIs: [...(params.terrainSegmentPOIs ?? []), ...MISSION_POIS],
        });
    }
}

export const THORN_MARCH = new ThornMarchMission();
