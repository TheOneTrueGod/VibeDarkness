/**
 * Towards the Light - Mission 2: Wolves slow, characters find residue flammable,
 * see a light in the distance and move towards it. Reach the campfire at the back
 * of the cave (within 1 tile of col 63, row 10) to win.
 *
 * Map: three sections 22×22 each (66×22). Left: campfire (decaying), rocks, grass.
 * Middle: scattered rocks and grass. Right: rocky cave with crystals and campfire at (63,10).
 * Wolves spawn continuously from darkness (one every half-round).
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import { NINJUTSU_DISABLED } from '../../../game/ninjutsu/ninjutsuConfig';
import type {
    BattleObjectiveDef,
    LevelEvent,
    SpecialTilePlacement,
} from '../../types';
import type { PreMissionStoryDef, PostMissionStoryDef } from '../../storyTypes';
import { ENEMY_DARK_WOLF } from '../../../constants/enemyConstants';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { MAP_SEGMENT_48_50_WAKEUP } from '../MapSegments/48_50_wakeup';
import { MAP_SEGMENT_49_50_PATH_TO_CAVE } from '../MapSegments/49_50_path_to_cave';
import {
    MAP_SEGMENT_50_50_CRYSTAL_CAVE,
    CAVE_CAMPFIRE,
    crystalSpecialTilesAt,
} from '../MapSegments/50_50_crystal_cave';
import { getTerrainForSegment } from '../../../terrain/segmentRegistry';

const COLS = 66;
const ROWS = 22;
/** Column offset for the right section (crystal cave): left 22 + middle 22. */
const RIGHT_OFFSET_COL = 44;
const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;


const _ = TerrainType.Grass;
const R = TerrainType.Rock;

/** Right third (44–65): rocky cave from shared map segment. */
function buildRightSection(): TerrainType[][] {
    return getTerrainForSegment('50_50_crystal_cave', MAP_SEGMENT_50_50_CRYSTAL_CAVE);
}

/** Apply global rocky border and small protrusions to a 2D terrain array (mutates). */
function applyBorder(grid: TerrainType[][], cols: number, rows: number): void {
    for (let c = 0; c < cols; c++) {
        grid[0][c] = R;
        grid[rows - 1][c] = R;
        if (rows > 2 && c % 5 === 2) grid[1][c] = R;
        if (rows > 3 && c % 7 === 3) grid[rows - 2][c] = R;
    }
    for (let r = 0; r < rows; r++) {
        grid[r][0] = R;
        grid[r][cols - 1] = R;
        if (cols > 2 && r % 4 === 1) grid[r][1] = R;
        if (cols > 3 && r % 6 === 2) grid[r][cols - 2] = R;
    }
}

function createTerrain(): TerrainGrid {
    const left = getTerrainForSegment('48_50_wakeup', MAP_SEGMENT_48_50_WAKEUP);
    const middle = getTerrainForSegment('49_50_path_to_cave', MAP_SEGMENT_49_50_PATH_TO_CAVE);
    const right = buildRightSection();
    const stitched = stitchTerrain([[left, middle, right]], _);
    applyBorder(stitched, COLS, ROWS);
    return TerrainGrid.createTerrainFromArray(COLS, ROWS, CELL_SIZE, stitched, _);
}

/** Two wolves at mission start: one above the big rock, one below (left section). */
const ENEMIES = [
    { ...ENEMY_DARK_WOLF, position: { x: 17 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 }, unitAITreeId: 'hunt' },
    { ...ENEMY_DARK_WOLF, position: { x: 17 * CELL_SIZE + CELL_SIZE / 2, y: 12 * CELL_SIZE + CELL_SIZE / 2 }, unitAITreeId: 'hunt' },
];

const LEVEL_EVENTS: LevelEvent[] = [
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 0.25 },
        maxUnits: 6,
        spawns: [{ characterId: 'dark_wolf', spawnBehaviour: 'anywhere', inDarkness: true, spawnCount: 1, unitAITreeId: 'hunt' }],
    },
    {
        type: 'victoryCheck',
        trigger: { afterRound: 0 },
        conditions: [
            {
                type: 'allUnitsNearPosition',
                col: CAVE_CAMPFIRE.col + RIGHT_OFFSET_COL,
                row: CAVE_CAMPFIRE.row,
                maxDistance: 2,
            },
        ],
        missionResult: 'victory',
    },
];

const BATTLE_OBJECTIVES: BattleObjectiveDef[] = [
    {
        id: 'find_safety',
        label: 'Find safety — reach the light in the cave to the east with your whole party',
        toComplete: {
            type: 'allUnitsNearPosition',
            col: CAVE_CAMPFIRE.col + RIGHT_OFFSET_COL,
            row: CAVE_CAMPFIRE.row,
            maxDistance: 2,
        },
        showObjectiveMarker: {
            enable: true,
            target: {
                type: 'position',
                x: (CAVE_CAMPFIRE.col + RIGHT_OFFSET_COL) * CELL_SIZE + CELL_SIZE / 2,
                y: CAVE_CAMPFIRE.row * CELL_SIZE + CELL_SIZE / 2,
            },
            showOffscreen: true,
        },
    },
];

    /** Campfire (decaying) at start; campfire at back of cave (63,10) is safety objective. Crystals for light. */
const SPECIAL_TILES: SpecialTilePlacement[] = [
    {
        defId: 'Campfire',
        col: 11,
        row: 10,
        defendPoint: true,
        hp: 5,
        emitsLight: { lightAmount: 6, radius: 4, decayRate: 0.5, decayInterval: 0.25 },
    },
    // Campfire at back of cave — reach within 1 tile to win (light only, not a defend point)
    {
        defId: 'Campfire',
        col: CAVE_CAMPFIRE.col + RIGHT_OFFSET_COL,
        row: CAVE_CAMPFIRE.row,
        hp: 5,
        emitsLight: { lightAmount: 10, radius: 8 },
    },
    ...crystalSpecialTilesAt(RIGHT_OFFSET_COL),
];

const PRE_MISSION_STORY: PreMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: "The darkness does not appear to be letting up, and the campfire is starting to grow dim.\n\nIt's time to light a torch and find somewhere safe.",
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
            text: [
							"You run toward the light, desperate to put distance between yourself and the wolves.",
							"You turn, expecting to fight, but they only skulk at the entrance, eyes gleaming.",
							"They do not follow."
						].join("\n"),
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: "You take a moment to steady yourself. Inside the cave, the walls are studded with glittering crystals—the first real light you've seen in this endless darkness. They pulse softly, like distant stars.",
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: [
							"In the center, a cauldron sits over a firepit, wood stacked nearby",
							"In one corner: bones, scraps of cloth, rusted tools and armour. Someone was here before.",
							"You figure now is as good a time as any to catch your breath. What would you like to do with this moment of respite?"
						].join("\n"),
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'choice',
            choiceId: 'towards_the_light_cave_choice',
            options: [],
            researchRewardSlots: [
                {
                    minTier: 2,
                    maxTier: 2,
                    loreTitle: 'Veins of the Hollow',
                    loreDescription: "Trace the cave's restless gleam—shape brittle stone into a spark that refuses to gutter out.",
                },
                {
                    minTier: 2,
                    maxTier: 2,
                    loreTitle: 'Iron in the Dark',
                    loreDescription: 'Salvage edge from scrap and nerve; let the next thrown thing carry your conviction.',
                },
            ],
        },
    ],
};

export class TowardsTheLightMission extends BaseMissionDef {
    segmentIds = ['48_50_wakeup', '49_50_path_to_cave', '50_50_crystal_cave'];

    missionId = 'towards_the_light';
    mapPosition = { x: 270, y: 150 };
    missionType = 'battle' as const;
    description = 'Push through the crystal caves toward a faint glow. Something ancient stirs in the dark.';
    campaignId = 'world_of_darkness';
    name = 'Towards the Light';
    completionRewards = { knowledgeKeys: ['Research'] };
    worldWidth = WORLD_WIDTH;
    worldHeight = WORLD_HEIGHT;
    enemies = ENEMIES;
    levelEvents = LEVEL_EVENTS;
    battleObjectives = BATTLE_OBJECTIVES;
    createTerrain = createTerrain;
    specialTiles = SPECIAL_TILES;
    aiController = 'stateBased' as const;
    preMissionStory = PRE_MISSION_STORY;
    postMissionStory = POST_MISSION_STORY;
    lightLevelEnabled = true;
    globalLightLevel = 0;
    ninjutsuPools = { shadow: NINJUTSU_DISABLED };
    playerSpawnPoints = [
        { col: 10, row: 9 },
        { col: 11, row: 9 },
        { col: 12, row: 9 },
        { col: 10, row: 10 },
        { col: 12, row: 10 },
        { col: 10, row: 11 },
        { col: 11, row: 11 },
        { col: 12, row: 11 },
    ];
}

export const TOWARDS_THE_LIGHT = new TowardsTheLightMission();
