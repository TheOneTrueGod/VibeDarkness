/**
 * Monster - Mission 4: Boss fight against the Alpha Wolf.
 * Map: 49_50 path (left) stitched to 50_50 crystal cave (right). The Alpha stands just inside
 * the cave on the dark crystal (a few columns past the segment seam).
 * When players leave and get within 400 units, he attacks.
 * Dark crystal creates a purple-tinted arena (light range 10).
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import type { LevelEvent, SpecialTilePlacement } from '../../types';
import type { PreMissionStoryDef, PostMissionStoryDef } from '../../storyTypes';
import { ENEMY_ALPHA_WOLF } from '../../../constants/enemyConstants';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { MAP_SEGMENT_49_50_PATH_TO_CAVE } from '../MapSegments/49_50_path_to_cave';
import {
    MAP_SEGMENT_50_50_CRYSTAL_CAVE,
    CAVE_CAMPFIRE,
    crystalSpecialTilesAt,
} from '../MapSegments/50_50_crystal_cave';

const SEGMENT_COLS = 22;
const SEGMENT_ROWS = 22;
/** 49_50 left, 50_50 right (same horizontal layout as mission 2’s path + cave). */
const COLS = SEGMENT_COLS * 2;
const ROWS = SEGMENT_ROWS;
const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;

/** Global column where segment 50_50 starts. */
const RIGHT_SEGMENT_COL = SEGMENT_COLS;

const _ = TerrainType.Grass;

function createTerrain(): TerrainGrid {
    const left = MAP_SEGMENT_49_50_PATH_TO_CAVE;
    const right = MAP_SEGMENT_50_50_CRYSTAL_CAVE;
    const stitched = stitchTerrain([[left, right]], _);
    return TerrainGrid.createTerrainFromArray(COLS, ROWS, CELL_SIZE, stitched, _);
}

function gridToWorld(col: number, row: number): { x: number; y: number } {
    return {
        x: col * CELL_SIZE + CELL_SIZE / 2,
        y: row * CELL_SIZE + CELL_SIZE / 2,
    };
}

/**
 * Wolf and dark crystal: five columns into 50_50 from the 49_50 seam (was seam tile; shifted east).
 */
const WOLF_COL = SEGMENT_COLS - 1 + 5;
const WOLF_ROW = 10;
const WOLF_POSITION = gridToWorld(WOLF_COL, WOLF_ROW);

/** Campfire deep in the crystal cave (50_50 local coords → global grid). */
const CAVE_CAMPFIRE_GLOBAL = {
    col: CAVE_CAMPFIRE.col + RIGHT_SEGMENT_COL,
    row: CAVE_CAMPFIRE.row,
} as const;

const ENEMIES = [
    {
        ...ENEMY_ALPHA_WOLF,
        name: 'Alpha Wolf',
        position: WOLF_POSITION,
    },
];

const LEVEL_EVENTS: LevelEvent[] = [
    {
        type: 'victoryCheck',
        trigger: { afterRound: 0 },
        conditions: [{ type: 'unitDead', unitCharacterId: 'alpha_wolf' }],
        emittedMessage: 'Defeat the Alpha Wolf',
        emittedByNpcId: '1',
        missionResult: 'victory',
    },
];

const SPECIAL_TILES: SpecialTilePlacement[] = [
    {
        defId: 'DarkCrystal',
        col: WOLF_COL,
        row: WOLF_ROW,
        emitsLight: { lightAmount: 20, radius: 10 },
        colorFilter: { color: 0x6633aa, alpha: 0.35, filterRadius: 8 },
    },
    {
        defId: 'Campfire',
        col: CAVE_CAMPFIRE_GLOBAL.col,
        row: CAVE_CAMPFIRE_GLOBAL.row,
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
            text: "A low growl echoes from beyond the cave mouth. Something waits for you out there—patient, hungry.",
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: "The Alpha Wolf has come. He will not let you pass. The dark crystal at his feet pulses with malice. There is no retreat—only the fight.",
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
            text: "The Alpha Wolf falls. From his chest, a dark crystal pulses—a BeastCore. The power of the beast, yours to wield.",
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'choice',
            choiceId: 'monster_beastcore_choice',
            options: [
                {
                    id: 'claim_beastcore',
                    label: 'Claim the BeastCore',
                    action: { type: 'equip_item', itemId: '014' },
                },
            ],
        },
    ],
};

export class MonsterMission extends BaseMissionDef {
    missionId = 'monster';
    campaignId = 'world_of_darkness';
    name = 'Monster';
    worldWidth = WORLD_WIDTH;
    worldHeight = WORLD_HEIGHT;
    enemies = ENEMIES;
    levelEvents = LEVEL_EVENTS;
    createTerrain = createTerrain;
    specialTiles = SPECIAL_TILES;
    aiController = 'alphaWolfBoss' as const;
    preMissionStory = PRE_MISSION_STORY;
    postMissionStory = POST_MISSION_STORY;
    lightLevelEnabled = true;
    globalLightLevel = -20;
    /** Spawns in the back of the cave (50_50), same relative layout as prior single-column map. */
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

    override initializeGameState(engine: Parameters<BaseMissionDef['initializeGameState']>[0], params: Parameters<BaseMissionDef['initializeGameState']>[1]): void {
        super.initializeGameState(engine, params);

        const alphaWolf = engine.units.find((u) => u.characterId === 'alpha_wolf');
        if (alphaWolf) {
            alphaWolf.aiContext = { aiTree: 'alphaWolfBoss' as const, sightRadius: 400 };
        }
    }
}

export const MONSTER = new MonsterMission();
