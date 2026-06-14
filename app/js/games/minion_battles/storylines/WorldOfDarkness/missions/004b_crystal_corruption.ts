/**
 * Crystal Corruption - Mission 4b: The cave is no longer safe.
 * Waves of wolves and slimes attack; one cave crystal is corrupted each round,
 * stripping its protective field. After round 6, spawning stops — kill what remains.
 * Map: 49_50 path (left) + 50_50 crystal cave (right), same layout as mission 5.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import type { LevelEvent, SpecialTilePlacement } from '../../types';
import type { PreMissionStoryDef, PostMissionStoryDef } from '../../storyTypes';
import { ENEMY_DARK_WOLF, ENEMY_SWARMLING, SLIME } from '../../../constants/enemyConstants';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { MAP_SEGMENT_49_50_PATH_TO_CAVE } from '../MapSegments/49_50_path_to_cave';
import { MAP_SEGMENT_50_50_CRYSTAL_CAVE, CAVE_CAMPFIRE, crystalSpecialTilesAt, CRYSTAL_POINTS } from '../MapSegments/50_50_crystal_cave';
import { getTerrainForSegment } from '../../../terrain/segmentRegistry';

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
const DARK_CRYSTAL_REPLACEMENT = {
    hp: 1,
    maxHp: 1,
    emitsLight: { lightAmount: 3, radius: 2 },
    colorFilter: { color: 0x6633aa, alpha: 0.3, filterRadius: 3 },
} as const;

/** Helper: world-space center of a path-segment grid cell. */
function pathCell(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
}

const INITIAL_ENEMIES = [
    { ...ENEMY_DARK_WOLF, position: pathCell(20, 8), unitAITreeId: 'hunt' },
    { ...ENEMY_DARK_WOLF, position: pathCell(19, 9), unitAITreeId: 'hunt' },
    { ...ENEMY_DARK_WOLF, position: pathCell(21, 9), unitAITreeId: 'hunt' },
    { ...ENEMY_SWARMLING, position: pathCell(18, 10), unitAITreeId: 'hunt' },
    { ...ENEMY_SWARMLING, position: pathCell(20, 11), unitAITreeId: 'hunt' },
    { ...SLIME, position: pathCell(19, 12), unitAITreeId: 'hunt' },
];

const LEVEL_EVENTS: LevelEvent[] = [
    // --- Periodic wolf waves every 0.5 rounds ---
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 0.5, startRound: 1, endRound: 5 },
        spawns: [
            { characterId: 'dark_wolf', spawnBehaviour: 'darkness', spawnCount: 2, unitAITreeId: 'hunt' },
            { characterId: 'swarmling', spawnBehaviour: 'darkness', spawnCount: 2, unitAITreeId: 'hunt' },
        ],
    },
    // --- Periodic slime waves every 0.5 rounds ---
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 1, startRound: 1, endRound: 5 },
        spawns: [{ characterId: 'slime', spawnBehaviour: 'edgeOfMap', spawnCount: 1, unitAITreeId: 'hunt' }],
    },
    // --- Crystal conversions: one per round ---
    {
        type: 'convertSpecialTile',
        trigger: { atRound: 1 },
        col: CRYSTAL_POINTS.crystal_1.col + RIGHT_SEGMENT_COL,
        row: CRYSTAL_POINTS.crystal_1.row,
        replacementDefId: 'DarkCrystal',
        replacementTile: DARK_CRYSTAL_REPLACEMENT,
        emittedMessage: 'A crystal shatters — the darkness creeps closer.',
        emittedByNpcId: '1',
    },
    {
        type: 'convertSpecialTile',
        trigger: { atRound: 2 },
        col: CRYSTAL_POINTS.crystal_2.col + RIGHT_SEGMENT_COL,
        row: CRYSTAL_POINTS.crystal_2.row,
        replacementDefId: 'DarkCrystal',
        replacementTile: DARK_CRYSTAL_REPLACEMENT,
        emittedMessage: 'Another crystal falls to corruption.',
        emittedByNpcId: '1',
    },
    {
        type: 'convertSpecialTile',
        trigger: { atRound: 3 },
        col: CRYSTAL_POINTS.crystal_3.col + RIGHT_SEGMENT_COL,
        row: CRYSTAL_POINTS.crystal_3.row,
        replacementDefId: 'DarkCrystal',
        replacementTile: DARK_CRYSTAL_REPLACEMENT,
        emittedMessage: 'The cave grows darker.',
        emittedByNpcId: '1',
    },
    {
        type: 'convertSpecialTile',
        trigger: { atRound: 4 },
        col: CRYSTAL_POINTS.crystal_4.col + RIGHT_SEGMENT_COL,
        row: CRYSTAL_POINTS.crystal_4.row,
        replacementDefId: 'DarkCrystal',
        replacementTile: DARK_CRYSTAL_REPLACEMENT,
        emittedMessage: 'The protection is failing.',
        emittedByNpcId: '1',
    },
    {
        type: 'convertSpecialTile',
        trigger: { atRound: 5 },
        col: CRYSTAL_POINTS.crystal_5.col + RIGHT_SEGMENT_COL,
        row: CRYSTAL_POINTS.crystal_5.row,
        replacementDefId: 'DarkCrystal',
        replacementTile: DARK_CRYSTAL_REPLACEMENT,
        emittedMessage: 'The last crystal is gone. Kill the remaining enemies!',
        emittedByNpcId: '1',
    },
    // --- Victory after round 6: eliminate all remaining enemies ---
    {
        type: 'victoryCheck',
        trigger: { afterRound: 6 },
        conditions: [{ type: 'eliminateAllEnemies' }],
        missionResult: 'victory',
    },
];

const SPECIAL_TILES: SpecialTilePlacement[] = [
    {
        defId: 'Campfire',
        col: CAVE_CAMPFIRE.col + RIGHT_SEGMENT_COL,
        row: CAVE_CAMPFIRE.row,
        hp: 5,
        emitsLight: { lightAmount: 10, radius: 8 },
    },
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
    mapPosition = { x: 780, y: 150 };
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
    preMissionStory = PRE_MISSION_STORY;
    postMissionStory = POST_MISSION_STORY;
    battleObjectives = [
        {
            id: 'survive',
            label: 'Survive the assault',
            toComplete: { type: 'atLeastRound' as const, round: 7 },
            onComplete: [{ type: 'revealObjective' as const, id: 'eliminate' }],
        },
        {
            id: 'eliminate',
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
