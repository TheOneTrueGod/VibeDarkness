/**
 * Monster - Mission 4: Boss fight against the Alpha Wolf.
 * He waits outside the cave. When players leave and get within 400 units, he attacks.
 * Dark crystal creates a purple-tinted arena (7x7, light range 10).
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import type { LevelEvent, SpecialTilePlacement } from '../../types';
import type { PreMissionStoryDef, PostMissionStoryDef } from '../../storyTypes';
import { ENEMY_ALPHA_WOLF } from '../../../constants/enemyConstants';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { MAP_SEGMENT_50_50_CRYSTAL_CAVE } from '../MapSegments/50_50_crystal_cave';
import { MAP_SEGMENT_50_49_CLIFF_PATH_NORTH } from '../MapSegments/50_49_cliff_path_north';
import { MAP_SEGMENT_50_48_PATH_TOP } from '../MapSegments/50_48_path_top';

const SEGMENT_COLS = 22;
const SEGMENT_ROWS = 22;
const SEGMENTS_VERTICAL = 3;
const COLS = SEGMENT_COLS;
const ROWS = SEGMENT_ROWS * SEGMENTS_VERTICAL;
const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;

const _ = TerrainType.Grass;

function createTerrain(): TerrainGrid {
    const top = MAP_SEGMENT_50_48_PATH_TOP;
    const middle = MAP_SEGMENT_50_49_CLIFF_PATH_NORTH;
    const bottom = MAP_SEGMENT_50_50_CRYSTAL_CAVE;
    const stitched = stitchTerrain([[top], [middle], [bottom]], _);
    return TerrainGrid.createTerrainFromArray(COLS, ROWS, CELL_SIZE, stitched, _);
}

function gridToWorld(col: number, row: number): { x: number; y: number } {
    return {
        x: col * CELL_SIZE + CELL_SIZE / 2,
        y: row * CELL_SIZE + CELL_SIZE / 2,
    };
}

/** Wolf and dark crystal: at cave entrance (south of cliff path, just above cave). */
const WOLF_COL = 10;
const WOLF_ROW = 43;
const WOLF_POSITION = gridToWorld(WOLF_COL, WOLF_ROW);

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
        colorFilter: { color: 0x6633aa, alpha: 0.2, filterRadius: 3 },
    },
    {
        defId: 'Campfire',
        col: 19,
        row: 54,
        hp: 5,
        emitsLight: { lightAmount: 10, radius: 8 },
    },
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
                    label: 'Claim the BeastCore (2 Dodge, 2 Beast Claw)',
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
    playerSpawnPoints = [
        { col: 17, row: 53 },
        { col: 18, row: 53 },
        { col: 19, row: 53 },
        { col: 17, row: 54 },
        { col: 19, row: 54 },
        { col: 17, row: 55 },
        { col: 18, row: 55 },
        { col: 19, row: 55 },
    ];

    override initializeGameState(engine: Parameters<BaseMissionDef['initializeGameState']>[0], params: Parameters<BaseMissionDef['initializeGameState']>[1]): void {
        super.initializeGameState(engine, params);

        const alphaWolf = engine.units.find((u) => u.characterId === 'alpha_wolf');
        if (alphaWolf) {
            alphaWolf.aiContext = {
                ...alphaWolf.aiContext,
                sightRadius: 400,
            };
        }
    }
}

export const MONSTER = new MonsterMission();
