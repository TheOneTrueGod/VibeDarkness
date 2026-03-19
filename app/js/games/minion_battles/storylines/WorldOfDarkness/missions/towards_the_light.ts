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
import type { LevelEvent, SpecialTilePlacement } from '../../types';
import type { PreMissionStoryDef } from '../../storyTypes';
import { ENEMY_DARK_WOLF } from '../../../constants/enemyConstants';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE, stitchTerrain } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';

const COLS = 66;
const ROWS = 22;
const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;

const _ = TerrainType.Grass;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;
const D = TerrainType.Dirt;

/** Left third (0–21): campfire area, rocks and grass. Campfire at (11,10). */
function buildLeftSection(): TerrainType[][] {
    return [
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [R, _, _, _, _, _, T, T, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [R, _, _, _, _, _, T, T, T, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [R, _, _, _, R, R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, T],
        [R, _, _, _, R, R, R, _, _, _, _, _, _, _, _, _, _, _, D, D, D, T],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, _, D],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, _, _],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, _, _],
        [R, _, R, R, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, R, _],
        [R, _, R, R, _, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, T],
        [R, _, _, R, R, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, T, T, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, T, R],
        [R, _, _, _, _, _, _, T, T, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [R, _, _, _, _, _, _, T, T, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [R, _, _, _, _, _, _, _, T, _, _, _, _, _, _, _, _, _, _, D, D, D],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R]
    ];
}

/** Middle third (22–43): scattered rocks and grass. */
function buildMiddleSection(): TerrainType[][] {
    return [
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [_, _, R, R, _, _, _, _, R, R, R, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, R, R, _, _, T, T, T, R, _, _, _, _, _, _],
        [T, _, T, T, _, _, _, _, _, _, _, _, T, _, R, R, _, _, R, R, _, _],
        [T, T, _, _, _, _, _, _, _, _, _, _, _, _, R, _, _, _, R, _, _, _],
        [D, _, _, _, R, R, _, _, _, D, D, D, _, _, _, _, _, _, _, _, _, _],
        [_, D, D, _, _, _, R, D, D, _, _, _, D, _, _, _, _, _, _, _, _, _],
        [_, _, _, D, D, D, D, _, _, _, _, _, _, D, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, R, R, _, _, D, D, D, D, D, D, D, _],
        [_, _, _, _, _, _, _, T, _, _, _, R, R, _, D, D, D, D, D, D, D, D],
        [_, R, _, _, _, T, T, T, T, T, _, _, _, _, D, _, _, _, _, _, _, D],
        [R, R, R, R, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _],
        [R, R, _, _, _, _, _, _, _, D, D, D, _, _, T, T, _, _, _, _, _, _],
        [R, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R, R, _, _, _, _],
        [_, _, D, D, D, _, _, _, _, _, T, _, T, _, _, _, R, R, R, _, _, _],
        [D, D, _, _, _, _, _, _, _, _, T, T, T, _, _, _, _, _, _, _, T, _],
        [_, _, _, _, _, _, _, R, R, R, T, T, T, _, R, _, _, _, _, _, _, T],
        [_, _, _, _, _, _, _, R, R, _, T, T, T, R, R, _, _, _, _, _, _, _],
        [_, _, _, R, R, R, R, R, _, _, _, _, _, _, R, R, _, _, _, _, _, _],
        [_, _, R, R, R, R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R]
    ];
}

/** Right third (44–65): rocky cave (backwards C). Opening at left, crystals on right wall. */
function buildRightSection(): TerrainType[][] {
    return [
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [_, _, R, R, _, _, R, _, _, R, R, _, _, _, R, R, R, R, R, R, R, R],
        [_, R, R, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, R, R, R, R],
        [_, R, _, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, R, R, R],
        [_, _, _, _, _, R, _, _, _, _, _, _, _, R, R, R, R, R, R, R, R, R],
        [_, _, _, _, R, R, R, _, _, _, _, _, _, R, R, R, D, D, D, R, R, R],
        [_, _, _, _, R, _, _, _, _, _, _, _, _, R, R, R, D, D, D, D, D, R],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, D, D, D, D, D, R],
        [_, _, _, D, D, D, D, D, _, _, _, _, _, R, R, R, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [D, D, D, _, _, _, _, _, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, D, D, D, D, D, D, D, R, R],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, D, D, D, D, D, R],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, D, D, D, D, D, R],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, D, D, D, D, D, R],
        [_, _, _, T, T, _, _, _, _, _, _, _, _, R, R, R, D, D, D, D, D, R],
        [_, _, T, T, T, T, T, T, _, _, _, _, _, R, R, R, D, D, D, D, D, R],
        [_, _, T, T, T, R, R, T, _, _, _, _, _, _, R, R, D, D, D, R, R, R],
        [_, _, T, T, T, R, R, T, _, _, _, _, _, _, R, R, R, R, R, R, R, R],
        [_, _, T, _, T, T, T, T, _, _, _, _, _, R, R, R, R, R, R, R, R, R],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    ];
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
    const left = buildLeftSection();
    const middle = buildMiddleSection();
    const right = buildRightSection();
    const stitched = stitchTerrain([[left, middle, right]], _);
    applyBorder(stitched, COLS, ROWS);
    return TerrainGrid.createTerrainFromArray(COLS, ROWS, CELL_SIZE, stitched, _);
}

/** Two wolves at mission start: one above the big rock, one below (left section). */
const ENEMIES = [
    { ...ENEMY_DARK_WOLF, name: 'Dark Wolf', position: { x: 17 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 } },
    { ...ENEMY_DARK_WOLF, name: 'Dark Wolf', position: { x: 17 * CELL_SIZE + CELL_SIZE / 2, y: 12 * CELL_SIZE + CELL_SIZE / 2 } },
];

const LEVEL_EVENTS: LevelEvent[] = [
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 0.25 },
        maxUnits: 10,
        spawns: [{ characterId: 'dark_wolf', spawnBehaviour: 'darkness', spawnCount: 2 }],
    },
    {
        type: 'victoryCheck',
        trigger: { afterRound: 0 },
        conditions: [{ type: 'allUnitsNearPosition', col: 63, row: 10, maxDistance: 2 }],
        emittedMessage: 'Find safety',
        emittedByNpcId: '1',
        missionResult: 'victory',
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
        emitsLight: { lightAmount: 10, radius: 8, decayRate: 1, decayInterval: 0.25 },
    },
    // Campfire at back of cave — reach within 1 tile to win
    {
        defId: 'Campfire',
        col: 63,
        row: 10,
        hp: 5,
        emitsLight: { lightAmount: 10, radius: 8 },
    },
    // Crystals tucked against the inner right wall of the backwards-C cave
    { defId: 'Crystal', col: 60, row: 7, emitsLight: { lightAmount: 20, radius: 3 }, protectRadius: 3 },
    { defId: 'Crystal', col: 60, row: 13, emitsLight: { lightAmount: 20, radius: 3 }, protectRadius: 3 },
    { defId: 'Crystal', col: 62, row: 6, emitsLight: { lightAmount: 20, radius: 3 }, protectRadius: 3 },
    { defId: 'Crystal', col: 61, row: 17, emitsLight: { lightAmount: 20, radius: 3 }, protectRadius: 3 },
    { defId: 'Crystal', col: 65, row: 13, emitsLight: { lightAmount: 20, radius: 3 }, protectRadius: 3 },
];

const PRE_MISSION_STORY: PreMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'A faint light glows in the distance. As your campfire grows dim, you gather what you can and move towards it hoping for shelter... or answers.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'groupVote',
            voteId: 'towards_the_light_torchbearer',
            text: 'Who will carry the torch into the darkness?',
            optionSource: 'players',
            effect: { type: 'grant_item_to_player', itemId: '005' },
        },
    ],
};

export class TowardsTheLightMission extends BaseMissionDef {
    missionId = 'towards_the_light';
    campaignId = 'world_of_darkness';
    name = 'Towards the Light';
    worldWidth = WORLD_WIDTH;
    worldHeight = WORLD_HEIGHT;
    enemies = ENEMIES;
    levelEvents = LEVEL_EVENTS;
    createTerrain = createTerrain;
    specialTiles = SPECIAL_TILES;
    aiController = 'stateBased' as const;
    preMissionStory = PRE_MISSION_STORY;
    lightLevelEnabled = true;
    globalLightLevel = -20;
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
