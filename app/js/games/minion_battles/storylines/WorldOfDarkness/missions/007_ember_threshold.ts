/**
 * Lantern quest M1 — follow patrol light south-west, protect a stirred Lanternite nest.
 *
 * Terrain: 2×2 segment grid (each 22×22):
 *   [49_50 wilds pad (proc) | 50_50 crystal cave]
 *   [49_51 west glade       | 50_51 south gate  ]
 */

import type { GameEngine } from '../../../game/GameEngine';
import { BaseMissionDef, type InitializeGameStateParams } from '../../BaseMissionDef';
import type { BattleObjectiveDef, LevelEvent, PlayerSpawnPoint, SpecialTilePlacement } from '../../types';
import type { PostMissionStoryDef, PreMissionStoryDef } from '../../storyTypes';
import {
    ALLY_LANTERNITE,
    ALLY_LANTERNITE_NEST,
    ENEMY_DARK_WOLF,
    ENEMY_RANGED,
    ENEMY_THORNBINDER,
} from '../../../constants/enemyConstants';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import {
    CAVE_CAMPFIRE,
    crystalSpecialTilesAt,
    MAP_SEGMENT_50_50_CRYSTAL_CAVE,
} from '../MapSegments/50_50_crystal_cave';
import { MAP_SEGMENT_49_50_PATH_TO_CAVE } from '../MapSegments/49_50_path_to_cave';
import { MAP_SEGMENT_49_51_WEST_GLADE, LANTERN_NEST_FOCUS } from '../MapSegments/49_51_west_glade';
import {
    MAP_SEGMENT_50_51_SOUTH_GATE,
    PATROL_DRAW_POINT,
} from '../MapSegments/50_51_south_gate';
import { getTerrainForSegment } from '../../../terrain/segmentRegistry';

const COLS = 44;
const ROWS = 44;
/** Local-grid column origin for world-col-50 segments (50_XX → col 22). */
const SEG_COL_50_ORIGIN = 22;
/** Local-grid row origin for world-row-51 segments (XX_51 → row 22). */
const SEG_ROW_51_ORIGIN = 22;
const CAVE_ORIGIN_COL = SEG_COL_50_ORIGIN;
const BOTTOM_SEGMENT_ROW_OFFSET = SEG_ROW_51_ORIGIN;
const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;

const _ = TerrainType.Grass;

/**
 * 2×2 segment grid — world addresses drive layout (lower col → left, lower row → top):
 * [ 49_50 wilds pad (proc) | 50_50 crystal cave ]
 * [ 49_51 west glade       | 50_51 south gate   ]
 */
function createTerrain(): TerrainGrid {
    const stitched = stitchTerrain(
        [
            [getTerrainForSegment('49_50_path_to_cave', MAP_SEGMENT_49_50_PATH_TO_CAVE), getTerrainForSegment('50_50_crystal_cave', MAP_SEGMENT_50_50_CRYSTAL_CAVE)],
            [getTerrainForSegment('49_51_west_glade', MAP_SEGMENT_49_51_WEST_GLADE), getTerrainForSegment('50_51_south_gate', MAP_SEGMENT_50_51_SOUTH_GATE)],
        ],
        _,
    );
    return TerrainGrid.createTerrainFromArray(COLS, ROWS, CELL_SIZE, stitched, _);
}

function gridToWorld(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
}

/** Patrol draw (south corridor) global grid — teases Lanternite breadcrumb objective. */
const PATROL_WORLD = gridToWorld(
    CAVE_ORIGIN_COL + PATROL_DRAW_POINT.col,
    BOTTOM_SEGMENT_ROW_OFFSET + PATROL_DRAW_POINT.row,
);

/** Lanternite mound — west compartment, bottom segment. */
const NEST_WORLD = gridToWorld(
    LANTERN_NEST_FOCUS.col,
    BOTTOM_SEGMENT_ROW_OFFSET + LANTERN_NEST_FOCUS.row,
);

const PATROL_NEAR_COL = CAVE_ORIGIN_COL + PATROL_DRAW_POINT.col;
const PATROL_NEAR_ROW = BOTTOM_SEGMENT_ROW_OFFSET + PATROL_DRAW_POINT.row;

/** Crystal-cave segment (NE top quadrant) → global grid. */
const CAVE_SEGMENT_ORIGIN_ROW = 0;

function caveGlobalCol(localCol: number): number {
    return CAVE_ORIGIN_COL + localCol;
}
function caveGlobalRow(localRow: number): number {
    return CAVE_SEGMENT_ORIGIN_ROW + localRow;
}

/** South-gate segment → global grid (east column band, bottom half). */
function southGateGlobalCol(localCol: number): number {
    return CAVE_ORIGIN_COL + localCol;
}
function southGateGlobalRow(localRow: number): number {
    return BOTTOM_SEGMENT_ROW_OFFSET + localRow;
}

/** Corridor crystals — south_gate local, anchored in PATROL_DRAW_POINT. */
const PATROL_LC = PATROL_DRAW_POINT.col;
const PATROL_LR = PATROL_DRAW_POINT.row;
const CRYSTAL_A = { lc: PATROL_LC, lr: PATROL_LR - 2 } as const;
const CRYSTAL_B = { lc: PATROL_LC + 3, lr: PATROL_LR } as const;

/** Campfire on cave floor (shared POI with missions 2–3; segment-local in `CAVE_CAMPFIRE`). */
const CAVE_FLOOR_CAMPFIRE_COL = caveGlobalCol(CAVE_CAMPFIRE.col);
const CAVE_FLOOR_CAMPFIRE_ROW = caveGlobalRow(CAVE_CAMPFIRE.row);

/** Thornbinder guarding the choke between corridors. */
const THORNBINDER_AMBUSH = gridToWorld(30, BOTTOM_SEGMENT_ROW_OFFSET + 5);

/** Intro wolves / slimes. */
const INITIAL_ENEMY_POSITIONS = {
    slimeA: gridToWorld(37, BOTTOM_SEGMENT_ROW_OFFSET + 3),
    slimeB: gridToWorld(CAVE_ORIGIN_COL + 6, BOTTOM_SEGMENT_ROW_OFFSET + 7),
    wolfA: gridToWorld(CAVE_ORIGIN_COL + 8, BOTTOM_SEGMENT_ROW_OFFSET + 2),
    wolfB: gridToWorld(10, BOTTOM_SEGMENT_ROW_OFFSET + 6),
};

const NEST_TRIGGER_RADIUS_PX = 220;

const PRE_MISSION_STORY: PreMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'The cave breathes a soft glow from the south. Somewhere ahead, restless green lanterns drift like wild things—calling you toward a deeper hollow.',
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
            text: 'The nest steadies. Lanternites skim the fungal dark, fearless now that the bramble-line has quieted—for the moment.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
    ],
};

function buildAssistLantern(offX: number, offY: number) {
    return {
        ...ALLY_LANTERNITE,
        name: 'Lanternite',
        position: { x: NEST_WORLD.x + offX, y: NEST_WORLD.y + offY },
        unitAITreeId: 'lanternitePatrol',
        lanterniteNestOwnerUnitId: 'lantern_nest_west',
        lanternPatrolFarWorld: { x: PATROL_WORLD.x, y: PATROL_WORLD.y },
        lanternPatrolLeg: 'toFar' as const,
        aiSettings: ALLY_LANTERNITE.aiSettings ?? { minRange: 0, maxRange: 600 },
    };
}

export class EmberThresholdMission extends BaseMissionDef {
    static readonly missionId = 'ember_threshold';
    static readonly nameStr = 'Ember at the Threshold';

    campaignId = 'world_of_darkness';
    segmentIds = ['49_50_path_to_cave', '50_50_crystal_cave', '49_51_west_glade', '50_51_south_gate'];

    battleObjectives: BattleObjectiveDef[] = [
        {
            id: 'reach_patrol',
            label: 'Follow the lanterns’ patrol—reach the luminous drift to the south',
            toComplete: {
                type: 'allUnitsNearPosition',
                col: PATROL_NEAR_COL,
                row: PATROL_NEAR_ROW,
                maxDistance: 4,
            },
        },
        {
            id: 'defeat_attackers',
            label: 'Defend the Lanternite mound — wipe out the stirred attackers',
            toComplete: { type: 'eliminateAllEnemies' },
            revealedInitially: false,
        },
    ];

    enemies = [
        {
            ...ALLY_LANTERNITE_NEST,
            unitId: 'lantern_nest_west',
            position: NEST_WORLD,
            lanterniteNest: {
                maxLanternites: 3,
                spawnIntervalSec: 14,
                patrolDestination: { kind: 'world' as const, x: PATROL_WORLD.x, y: PATROL_WORLD.y },
                networked: true,
                nestPoiId: 'nest_west',
                scoutConstructionSec: 12,
            },
        },
        {
            ...ENEMY_THORNBINDER,
            position: THORNBINDER_AMBUSH,
        },
        {
            ...ENEMY_RANGED,
            name: 'Slime',
            position: INITIAL_ENEMY_POSITIONS.slimeA,
        },
        {
            ...ENEMY_RANGED,
            name: 'Slime',
            position: INITIAL_ENEMY_POSITIONS.slimeB,
        },
        {
            ...ENEMY_DARK_WOLF,
            position: INITIAL_ENEMY_POSITIONS.wolfA,
        },
        {
            ...ENEMY_DARK_WOLF,
            position: INITIAL_ENEMY_POSITIONS.wolfB,
        },
    ];

    levelEvents: LevelEvent[] = [
        {
            type: 'proximitySpawn',
            trigger: {
                centerWorldX: NEST_WORLD.x,
                centerWorldY: NEST_WORLD.y,
                radiusPx: NEST_TRIGGER_RADIUS_PX,
            },
            fireOnce: true,
            emittedMessage: 'Something tears through the mulch toward the Lanternite mound!',
            emittedByNpcId: '1',
            spawnWaveEntries: [
                {
                    characterId: 'thornbinder',
                    spawnBehaviour: 'anywhere',
                    spawnTarget: { x: NEST_WORLD.x, y: NEST_WORLD.y, radius: 9 },
                    spawnCount: 1,
                },
                {
                    characterId: 'dark_wolf',
                    spawnBehaviour: 'anywhere',
                    spawnTarget: { x: NEST_WORLD.x, y: NEST_WORLD.y, radius: 12 },
                    spawnCount: 2,
                },
                {
                    characterId: 'enemy_ranged',
                    name: 'Slime',
                    spawnBehaviour: 'anywhere',
                    spawnTarget: { x: NEST_WORLD.x, y: NEST_WORLD.y, radius: 14 },
                    spawnCount: 2,
                },
            ],
            extraEnemySpawns: [buildAssistLantern(-14, 0), buildAssistLantern(16, -8)],
            revealObjectiveIds: ['defeat_attackers'],
        },
        {
            type: 'victoryCheck',
            trigger: { afterRound: 0 },
            conditions: [{ type: 'eliminateAllEnemies' }],
            missionResult: 'victory',
        },
    ];

    missionId = EmberThresholdMission.missionId;
    name = EmberThresholdMission.nameStr;
    worldWidth = WORLD_WIDTH;
    worldHeight = WORLD_HEIGHT;
    aiController = 'defensePoints' as const;
    createTerrain = createTerrain;

    gatherPartyBackgroundImage = STORY_BACKGROUNDS.campfire;
    playerSpawnPoints: PlayerSpawnPoint[] = [{ col: 41, row: 12 }];

    lightLevelEnabled = true;
    globalLightLevel = -20;

    specialTiles: SpecialTilePlacement[] = [
        ...crystalSpecialTilesAt(CAVE_ORIGIN_COL, CAVE_SEGMENT_ORIGIN_ROW),
        {
            defId: 'Crystal',
            col: southGateGlobalCol(CRYSTAL_A.lc),
            row: southGateGlobalRow(CRYSTAL_A.lr),
            hp: 1,
            emitsLight: { lightAmount: 12, radius: 3.5 },
        },
        {
            defId: 'Crystal',
            col: southGateGlobalCol(CRYSTAL_B.lc),
            row: southGateGlobalRow(CRYSTAL_B.lr),
            hp: 1,
            emitsLight: { lightAmount: 10, radius: 3 },
        },
        {
            defId: 'Campfire',
            col: CAVE_FLOOR_CAMPFIRE_COL,
            row: CAVE_FLOOR_CAMPFIRE_ROW,
            hp: 3,
            emitsLight: { lightAmount: 15, radius: 6 },
        },
    ];

    preMissionStory = PRE_MISSION_STORY;
    postMissionStory = POST_MISSION_STORY;

    override initializeGameState(engine: GameEngine, params: InitializeGameStateParams): void {
        super.initializeGameState(engine, params);
        engine.addSpecialTile({
            id: 'nest_ground_fire',
            defId: 'Campfire',
            col: Math.floor(LANTERN_NEST_FOCUS.col),
            row: Math.floor(BOTTOM_SEGMENT_ROW_OFFSET + LANTERN_NEST_FOCUS.row),
            hp: 4,
            maxHp: 4,
            defendPoint: false,
            emitsLight: { lightAmount: 10, radius: 4 },
        });
    }
}

/** Singleton instance for missions map. */
export const EMBER_THRESHOLD = new EmberThresholdMission();
