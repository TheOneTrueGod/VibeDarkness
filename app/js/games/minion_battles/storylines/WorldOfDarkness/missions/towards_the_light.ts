/**
 * Towards the Light - Mission 2: Wolves slow, characters find residue flammable,
 * see a light in the distance and move towards it. Reach the crystals to win.
 *
 * Map: three sections 22×22 each (66×22). Left: campfire (decaying), rocks, grass.
 * Middle: scattered rocks and grass. Right: rocky cave with 3 crystals.
 * Wolves spawn continuously from darkness (one every half-round).
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import type { LevelEvent, SpecialTilePlacement } from '../../types';
import type { PreMissionStoryDef } from '../../storyTypes';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';

const COLS = 66;
const ROWS = 22;

function createTerrain(): TerrainGrid {
    const grid = new TerrainGrid(COLS, ROWS, CELL_SIZE, TerrainType.Grass);

    // ---- Left section (0-21): same feel as dark_awakening ----
    // Campfire at center (11, 10). Rocks and grass around.
    const leftRocks: [number, number][] = [
        [4, 4], [5, 4], [4, 5], [5, 5], [6, 5],
        [2, 9], [3, 9], [2, 10], [3, 10], [3, 11], [4, 11],
        [17, 6], [18, 6], [19, 6], [16, 7], [17, 7], [18, 7], [19, 7], [16, 8], [17, 8], [18, 8], [19, 8], [16, 9], [17, 9], [18, 9], [19, 9], [17, 10], [18, 10], [19, 10], [17, 11], [18, 11], [19, 11],
    ];
    for (const [c, r] of leftRocks) grid.set(c, r, TerrainType.Rock);

    const leftGrass: [number, number][] = [
        [6, 2], [7, 2], [6, 3], [7, 3], [8, 3],
        [7, 14], [8, 14], [7, 15], [8, 15], [8, 16],
        [21, 4], [21, 5], [22, 4], [22, 5], [22, 6],
    ];
    for (const [c, r] of leftGrass) grid.set(c, r, TerrainType.ThickGrass);

    // ---- Middle section (22-43): scattered ----
    const midRocks: [number, number][] = [
        [26, 5], [27, 5], [28, 6], [32, 8], [33, 8], [34, 9],
        [38, 14], [39, 14], [40, 15], [35, 18], [36, 18], [37, 19],
    ];
    for (const [c, r] of midRocks) grid.set(c, r, TerrainType.Rock);
    const midGrass: [number, number][] = [
        [24, 3], [25, 3], [30, 10], [31, 10], [36, 12], [37, 12], [42, 16], [43, 17],
    ];
    for (const [c, r] of midGrass) grid.set(c, r, TerrainType.ThickGrass);

    // ---- Right section (44-65): rocky cave ----
    for (let c = 44; c < 66; c++) {
        for (let r = 0; r < 22; r++) {
            if (c >= 48 && c <= 58 && r >= 8 && r <= 16) continue;
            if ((c + r) % 5 === 0 || (c * 2 + r) % 7 === 0) grid.set(c, r, TerrainType.Rock);
        }
    }
    const caveRocks: [number, number][] = [
        [44, 6], [45, 6], [46, 7], [47, 7], [64, 10], [65, 10], [64, 11], [65, 11],
        [50, 7], [51, 7], [52, 8], [54, 8], [56, 9], [58, 10], [56, 14], [58, 15],
    ];
    for (const [c, r] of caveRocks) grid.set(c, r, TerrainType.Rock);

    return grid;
}

const LEVEL_EVENTS: LevelEvent[] = [
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 0.5 },
        spawns: [{ characterId: 'dark_wolf', spawnBehaviour: 'darkness', spawnCount: 2 }],
    },
    {
        type: 'victoryCheck',
        trigger: { afterRound: 0 },
        conditions: [{ type: 'allUnitsNearCrystals', maxDistance: 2 }],
        emittedMessage: 'Reach the crystals with all living party members to win',
        emittedByNpcId: '1',
        missionResult: 'victory',
    },
];

/** Campfire (decaying light), then 3 crystals in the cave. */
const SPECIAL_TILES: SpecialTilePlacement[] = [
    {
        defId: 'DefendPoint',
        col: 11,
        row: 10,
        hp: 5,
        tags: { destructible: true },
        emitsLight: { lightAmount: 12, radius: 8 },
        decayLightPerRound: true,
    },
    { defId: 'Crystal', col: 50, row: 10, emitsLight: { lightAmount: 20, radius: 3 } },
    { defId: 'Crystal', col: 54, row: 14, emitsLight: { lightAmount: 20, radius: 3 } },
    { defId: 'Crystal', col: 52, row: 18, emitsLight: { lightAmount: 20, radius: 3 } },
];

const PRE_MISSION_STORY: PreMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'Flee the Darkness',
            textEffect: 'title_bounce',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'The wolf attacks slowed for a time. In the lull, you experimented with the shadowy residue they left behind—and found it catches fire easily.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'A faint light glows in the distance. As your campfire grows dim, you gather what you can and move towards it hoping for shelter... or answers.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
    ],
};

export class TowardsTheLightMission extends BaseMissionDef {
    missionId = 'towards_the_light';
    campaignId = 'world_of_darkness';
    name = 'Towards the Light';
    enemies = [];
    levelEvents = LEVEL_EVENTS;
    createTerrain = createTerrain;
    specialTiles = SPECIAL_TILES;
    aiController = 'defensePoints' as const;
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
