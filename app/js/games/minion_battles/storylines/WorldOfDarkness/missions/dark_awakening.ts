/**
 * Dark Awakening - Mission enemy and terrain definitions.
 *
 * Dark Wolves placed on the right side of the arena.
 * Terrain: Grassy open area with patches of thick grass, small stone outcrops,
 * and one large irregular rock formation in the center.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import type { LevelEvent, SpecialTilePlacement } from '../../types';
import type { PreMissionStoryDef } from '../../storyTypes';
import { ENEMY_DARK_WOLF } from '../../../constants/enemyConstants';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';

// Grid: 38 columns × 22 rows (extended from 30×20; 40px cells)

function createTerrain(): TerrainGrid {
    const grid = new TerrainGrid(30, 22, CELL_SIZE, TerrainType.Grass);

    // Large irregular rock formation in the center (~8×8, irregularly shaped)
    const bigRock: [number, number][] = [
        [17, 6], [18, 6], [19, 6],
        [16, 7], [17, 7], [18, 7], [19, 7], [20, 7],
        [16, 8], [17, 8], [18, 8], [19, 8], [20, 8], [21, 8],
        [16, 9], [17, 9], [18, 9], [19, 9], [20, 9], [21, 9],
        [16, 10], [17, 10], [18, 10], [19, 10], [20, 10],
        [16, 11], [17, 11], [18, 11], [19, 11], [20, 11],
        [17, 12], [18, 12], [19, 12],
    ];
    for (const [c, r] of bigRock) grid.set(c, r, TerrainType.Rock);

    // Small rock patch — upper-left area (irregular 3×2)
    grid.set(4, 4, TerrainType.Rock);
    grid.set(5, 4, TerrainType.Rock);
    grid.set(4, 5, TerrainType.Rock);
    grid.set(5, 5, TerrainType.Rock);
    grid.set(6, 5, TerrainType.Rock);

    // Small rock patch — lower-right area (irregular 2×3)
    grid.set(24, 14, TerrainType.Rock);
    grid.set(25, 14, TerrainType.Rock);
    grid.set(24, 15, TerrainType.Rock);
    grid.set(25, 15, TerrainType.Rock);
    grid.set(25, 16, TerrainType.Rock);

    // Small rock patch — right side near enemies
    grid.set(27, 3, TerrainType.Rock);
    grid.set(28, 3, TerrainType.Rock);
    grid.set(28, 4, TerrainType.Rock);

    // Small, oddly shaped rocks — left side of the campfire (DefendPoint at col 8, row 10)
    // Create a few irregular stones just to the left and slightly above/below.
    grid.set(2, 9, TerrainType.Rock);
    grid.set(3, 9, TerrainType.Rock);
    grid.set(2, 10, TerrainType.Rock);
    grid.set(3, 10, TerrainType.Rock);
    grid.set(3, 11, TerrainType.Rock);
    grid.set(4, 11, TerrainType.Rock);

    // Thick grass patch — upper-left (irregular 3×3)
    grid.set(6, 2, TerrainType.ThickGrass);
    grid.set(7, 2, TerrainType.ThickGrass);
    grid.set(6, 3, TerrainType.ThickGrass);
    grid.set(7, 3, TerrainType.ThickGrass);
    grid.set(8, 3, TerrainType.ThickGrass);

    // Thick grass patch — lower-left (irregular 3×3)
    grid.set(7, 14, TerrainType.ThickGrass);
    grid.set(8, 14, TerrainType.ThickGrass);
    grid.set(7, 15, TerrainType.ThickGrass);
    grid.set(8, 15, TerrainType.ThickGrass);
    grid.set(8, 16, TerrainType.ThickGrass);

    // Thick grass patch — right side (irregular 2×3)
    grid.set(21, 4, TerrainType.ThickGrass);
    grid.set(22, 4, TerrainType.ThickGrass);
    grid.set(21, 5, TerrainType.ThickGrass);
    grid.set(22, 5, TerrainType.ThickGrass);
    grid.set(22, 6, TerrainType.ThickGrass);

    // Thick grass patch — lower-right (irregular 3×2)
    grid.set(22, 16, TerrainType.ThickGrass);
    grid.set(23, 16, TerrainType.ThickGrass);
    grid.set(22, 17, TerrainType.ThickGrass);
    grid.set(23, 17, TerrainType.ThickGrass);
    grid.set(24, 17, TerrainType.ThickGrass);

    // One rock along the top at the edge of the light (campfire at 13,10; radius 10) — half in, half out
    grid.set(12, 0, TerrainType.Rock);
    grid.set(13, 0, TerrainType.Rock);

    // Rocks along the new bottom edge (rows 20 and 21 after extending grid height)
    // Slightly irregular shapes near the center and right.
    grid.set(16, 20, TerrainType.Rock);
    grid.set(17, 20, TerrainType.Rock);
    grid.set(17, 21, TerrainType.Rock);

    grid.set(26, 20, TerrainType.Rock);
    grid.set(27, 20, TerrainType.Rock);
    grid.set(27, 21, TerrainType.Rock);

    return grid;
}

const ENEMIES = [
    { ...ENEMY_DARK_WOLF, name: 'Dark Wolf', position: { x: 1000, y: 300 } },
    { ...ENEMY_DARK_WOLF, name: 'Dark Wolf', position: { x: 1050, y: 500 } },
    { ...ENEMY_DARK_WOLF, name: 'Dark Wolf', position: { x: 1100, y: 400 } },
];

const LEVEL_EVENTS: LevelEvent[] = [
    {
        type: 'spawnWave',
        trigger: { atRound: 2 },
        spawns: [{ characterId: 'dark_wolf', spawnBehaviour: 'darkness', spawnCount: 2 }],
        emittedMessage: 'Reinforcements have arrived!',
        emittedByNpcId: '1',
    },
    {
        type: 'spawnWave',
        trigger: { atRound: 3 },
        spawns: [{ characterId: 'dark_wolf', spawnBehaviour: 'darkness', spawnCount: 3 }],
        emittedMessage: 'Reinforcements have arrived!',
        emittedByNpcId: '1',
    },
    {
        type: 'spawnWave',
        trigger: { atRound: 4 },
        spawns: [{ characterId: 'dark_wolf', spawnBehaviour: 'darkness', spawnCount: 3 }],
        emittedMessage: 'Reinforcements have arrived!',
        emittedByNpcId: '1',
    },
    {
        type: 'victoryCheck',
        trigger: { afterRound: 4 },
        conditions: [{ type: 'eliminateAllEnemies' }],
        emittedMessage: 'Eliminate all enemies to win',
        emittedByNpcId: '1',
        missionResult: 'victory',
    },
];

/** Defend point: campfire slightly right of player spawn (5 HP). Destructible; emits light. */
const SPECIAL_TILES: SpecialTilePlacement[] = [
    {
        defId: 'DefendPoint',
        col: 13,
        row: 10,
        hp: 5,
        tags: { destructible: true },
        emitsLight: { lightAmount: 15, radius: 10 },
    },
];

const PRE_MISSION_STORY: PreMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: "You open your eyes to see a campfire in front of you. You don't have much time to get your bearings or remember where you are before you hear movement and growling in the edge of the light. You quickly scan your surroundings for something to defend yourself with.",
            portraitSide: 'left',
        },
        {
            type: 'choice',
            choiceId: 'dark_awakening_weapon',
            options: [
                { id: 'rocks', label: 'Grab some nearby rocks', action: { type: 'equip_item', itemId: 'rocks' } },
                { id: 'torch', label: 'Grab a smoldering stick', action: { type: 'equip_item', itemId: 'torch' } },
                {
                    id: 'pot_shield',
                    label: 'Pick up the lid of a pot from the campfire',
                    action: { type: 'equip_item', itemId: 'pot_shield' },
                },
            ],
        },
    ],
};

export class DarkAwakeningMission extends BaseMissionDef {
    missionId = 'dark_awakening';
    campaignId = 'world_of_darkness';
    name = 'A Dark Awakening';
    enemies = ENEMIES;
    levelEvents = LEVEL_EVENTS;
    createTerrain = createTerrain;
    specialTiles = SPECIAL_TILES;
    aiController = 'defensePoints' as const;
    preMissionStory = PRE_MISSION_STORY;
    lightLevelEnabled = true;
    globalLightLevel = -20;
    /** Player spawn points: eight positions around the campfire in a square. */
    playerSpawnPoints = [
        { col: 12, row: 9 },
        { col: 13, row: 9 },
        { col: 14, row: 9 },
        { col: 12, row: 10 },
        { col: 14, row: 10 },
        { col: 12, row: 11 },
        { col: 13, row: 11 },
        { col: 14, row: 11 },
    ];
}

/** Mission instance for use in MISSION_MAP and mission select. */
export const DARK_AWAKENING = new DarkAwakeningMission();
