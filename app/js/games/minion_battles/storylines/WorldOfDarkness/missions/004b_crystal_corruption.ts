/**
 * Crystal Corruption - Mission 4b: The cave is no longer safe.
 * Waves of wolves and slimes attack; one cave crystal is corrupted each round,
 * stripping its protective field. After round 6, spawning stops — kill what remains.
 * Map: 49_50 path (left) + 50_50 crystal cave (right), same layout as mission 5.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import { ObjectiveType } from '../../objectiveTypes';
import { NINJUTSU_3_FLURRY_PER_ROUND } from '../../../game/ninjutsu/ninjutsuConfig';
import type { LevelEvent, LevelEventConvertSpecialTile, SpecialTilePlacement } from '../../types';
import { MISSION_MAP_DISABLED } from '../../types';
import type { PreMissionStoryDef, PostMissionStoryDef } from '../../storyTypes';
import { ENEMY_DARK_WOLF, ENEMY_SWARMLING, SLIME } from '../../../constants/enemyConstants';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { MAP_SEGMENT_49_50_PATH_TO_CAVE } from '../MapSegments/49_50_path_to_cave';
import {
    MAP_SEGMENT_50_50_CRYSTAL_CAVE,
    CAVE_CAMPFIRE,
    crystalSpecialTilesAt,
    CRYSTAL_POINTS,
    CRYSTAL_TILE_DEFAULTS,
    DARK_CRYSTAL_TILE_DEFAULTS,
} from '../MapSegments/50_50_crystal_cave';
import { getTerrainForSegment } from '../../../terrain/segmentRegistry';
import { WOD_CH0_MAP_X_COL0, WOD_CH0_MAP_Y_ROW1 } from '../chapter0Map';

const SEGMENT_COLS = 22;
const SEGMENT_ROWS = 22;
const COLS = SEGMENT_COLS * 2;
const ROWS = SEGMENT_ROWS;
const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;

/** Global column where segment 50_50 starts. */
const RIGHT_SEGMENT_COL = SEGMENT_COLS;

const _ = TerrainType.Grass;

function createTerrain(): TerrainGrid {
    const left = getTerrainForSegment('49_50_path_to_cave', MAP_SEGMENT_49_50_PATH_TO_CAVE);
    const right = getTerrainForSegment('50_50_crystal_cave', MAP_SEGMENT_50_50_CRYSTAL_CAVE);
    const stitched = stitchTerrain([[left, right]], _);
    return TerrainGrid.createTerrainFromArray(COLS, ROWS, CELL_SIZE, stitched, _);
}

/** DarkCrystal properties used when replacing a converted Crystal. */
const DARK_CRYSTAL_REPLACEMENT: LevelEventConvertSpecialTile['replacementTile'] = {
    hp: 1,
    maxHp: 1,
    emitsLight: DARK_CRYSTAL_TILE_DEFAULTS.emitsLight,
    colorFilter: DARK_CRYSTAL_TILE_DEFAULTS.colorFilter,
};

/** Crystal properties used when a DarkCrystal recovers. */
export const RESTORED_CRYSTAL_REPLACEMENT: LevelEventConvertSpecialTile['replacementTile'] = {
    hp: 1,
    maxHp: 1,
    emitsLight: CRYSTAL_TILE_DEFAULTS.emitsLight,
};

const CRYSTAL_ORDER = [
    CRYSTAL_POINTS.crystal_1,
    CRYSTAL_POINTS.crystal_2,
    CRYSTAL_POINTS.crystal_3,
    CRYSTAL_POINTS.crystal_4,
    CRYSTAL_POINTS.crystal_5,
] as const;

/**
 * One crystal conversion per round (rounds 1–5, crystal_1 first), each swapping the tile for
 * `replacementDefId`. `messages[i]` is announced with the i-th conversion.
 */
export function crystalConversionEvents(
    replacementDefId: string,
    replacementTile: LevelEventConvertSpecialTile['replacementTile'],
    messages: readonly string[],
): LevelEventConvertSpecialTile[] {
    return CRYSTAL_ORDER.map((point, i) => ({
        type: 'convertSpecialTile' as const,
        trigger: { atRound: i + 1 },
        col: point.col + RIGHT_SEGMENT_COL,
        row: point.row,
        replacementDefId,
        replacementTile,
        emittedMessage: messages[i],
        emittedByNpcId: '1',
    }));
}

/** Helper: world-space center of a path-segment grid cell. */
function pathCell(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
}

const CRYSTAL_CORRUPTION_NINJUTSU_PER_UNIT = 0.1;

const INITIAL_ENEMIES = [
    { ...ENEMY_DARK_WOLF, position: pathCell(20, 8), unitAITreeId: 'hunt' },
    { ...ENEMY_DARK_WOLF, position: pathCell(19, 9), unitAITreeId: 'hunt' },
    { ...ENEMY_DARK_WOLF, position: pathCell(21, 9), unitAITreeId: 'hunt' },
    { ...ENEMY_SWARMLING, position: pathCell(18, 10), unitAITreeId: 'hunt' },
    { ...ENEMY_SWARMLING, position: pathCell(20, 11), unitAITreeId: 'hunt' },
    { ...SLIME, position: pathCell(19, 12), unitAITreeId: 'hunt' },
];

/** Spawn waves and the round-6 victory check, shared with the quest copy. */
export const CRYSTAL_CORRUPTION_COMBAT_EVENTS: LevelEvent[] = [
    // --- Periodic wolf waves every 0.5 rounds ---
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 0.5, startRound: 1, endRound: 5 },
        spawns: [
            { characterId: 'dark_wolf', spawnBehaviour: 'anywhere', inDarkness: true, spawnCount: 2, unitAITreeId: 'hunt' },
            { characterId: 'swarmling', spawnBehaviour: 'anywhere', inDarkness: true, spawnCount: 2, unitAITreeId: 'hunt' },
        ],
    },
    // --- Periodic slime waves every 0.5 rounds ---
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 1, startRound: 1, endRound: 5 },
        spawns: [{ characterId: 'slime', spawnBehaviour: 'edgeOfMap', spawnCount: 1, unitAITreeId: 'hunt' }],
    },
    // --- Victory after round 6: eliminate all remaining enemies ---
    {
        type: 'victoryCheck',
        trigger: { afterRound: 6 },
        conditions: [{ type: 'eliminateAllEnemies' }],
        missionResult: 'victory',
    },
];

const LEVEL_EVENTS: LevelEvent[] = [
    ...CRYSTAL_CORRUPTION_COMBAT_EVENTS,
    ...crystalConversionEvents('DarkCrystal', DARK_CRYSTAL_REPLACEMENT, [
        'A crystal shatters — the darkness creeps closer.',
        'Another crystal falls to corruption.',
        'The cave grows darker.',
        'The protection is failing.',
        'The last crystal is gone. Kill the remaining enemies!',
    ]),
];

/** Cave campfire on the right segment. */
export const CRYSTAL_CORRUPTION_CAMPFIRE: SpecialTilePlacement = {
    defId: 'Campfire',
    col: CAVE_CAMPFIRE.col + RIGHT_SEGMENT_COL,
    row: CAVE_CAMPFIRE.row,
    hp: 5,
    emitsLight: { lightAmount: 10, radius: 8 },
};

/** Global column where the crystal cave segment starts (for crystal placements). */
export const CRYSTAL_CORRUPTION_CAVE_COL = RIGHT_SEGMENT_COL;

const SPECIAL_TILES: SpecialTilePlacement[] = [
    CRYSTAL_CORRUPTION_CAMPFIRE,
    ...crystalSpecialTilesAt(RIGHT_SEGMENT_COL),
];

const PRE_MISSION_STORY: PreMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'The howling outside the cave grows louder. They have found you.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'One by one the crystals flicker. The cave is no longer safe — only your hands can stop what comes next.',
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
            text: 'The last of them falls. The cave stands — but the crystals are gone, and with them, the silence you once knew.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'Something worse is coming. You can feel it.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
    ],
};

export class CrystalCorruptionMission extends BaseMissionDef {
    segmentIds = ['49_50_path_to_cave', '50_50_crystal_cave'];

    missionId = 'crystal_corruption';
    mapPosition?: { x: number; y: number } = { x: WOD_CH0_MAP_X_COL0, y: WOD_CH0_MAP_Y_ROW1 };
    isSideMission = true;
    disabled = MISSION_MAP_DISABLED;
    missionType = 'battle' as const;
    description = 'The crystals pulse with dark energy. Purge the corruption before it spreads beyond the cave.';
    campaignId = 'world_of_darkness';
    name = 'Crystal Corruption';
    worldWidth = WORLD_WIDTH;
    worldHeight = WORLD_HEIGHT;
    enemies = INITIAL_ENEMIES;
    levelEvents = LEVEL_EVENTS;
    createTerrain = createTerrain;
    specialTiles = SPECIAL_TILES;
    lightLevelEnabled = true;
    globalLightLevel = 0;
    ninjutsuPools = {
        shadow: { ...NINJUTSU_3_FLURRY_PER_ROUND, ninjutsuPerUnit: CRYSTAL_CORRUPTION_NINJUTSU_PER_UNIT },
    };
    preMissionStory = PRE_MISSION_STORY;
    postMissionStory = POST_MISSION_STORY;
    battleObjectives = [
        {
            id: 'survive',
            objectiveType: ObjectiveType.Survive,
            label: 'Survive the assault',
            toComplete: { type: 'atLeastRound' as const, round: 7 },
            onComplete: [{ type: 'revealObjective' as const, id: 'eliminate' }],
        },
        {
            id: 'eliminate',
            objectiveType: ObjectiveType.EliminateAll,
            label: 'Kill the remaining enemies',
            requiresCompletedId: 'survive',
            toComplete: { type: 'eliminateAllEnemies' as const },
        },
    ];

    playerSpawnPoints = [
        { col: 17 + RIGHT_SEGMENT_COL, row: 9 },
        { col: 18 + RIGHT_SEGMENT_COL, row: 9 },
        { col: 19 + RIGHT_SEGMENT_COL, row: 9 },
        { col: 17 + RIGHT_SEGMENT_COL, row: 10 },
        { col: 19 + RIGHT_SEGMENT_COL, row: 10 },
        { col: 17 + RIGHT_SEGMENT_COL, row: 11 },
        { col: 18 + RIGHT_SEGMENT_COL, row: 11 },
        { col: 19 + RIGHT_SEGMENT_COL, row: 11 },
    ];
}

export const CRYSTAL_CORRUPTION = new CrystalCorruptionMission();
