/**
 * The Last Holdout - Mission enemy and terrain definitions.
 *
 * C-shaped bunker on the left where players defend. Global darkness 0; campfire in the
 * middle of the C (10 HP, defense point, light 6 radius 6). Continuous spawn: 4 swarmlings randomly
 * scattered in the right half of the map every 0.25 rounds. Victory: defeat all
 * enemies after round 4.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import { NINJUTSU_TIER_1 } from '../../../game/ninjutsu/ninjutsuConfig';
import type { LevelEvent, SpecialTilePlacement } from '../../types';
import { darkSwarmModifier } from '../../../worldModifiers/presets';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';

// Grid: 30 columns × 20 rows (1200×800 world at 40px cells)
const COLS = 30;
const ROWS = 20;
const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;

/** Right-half spawn circle: center at (1000, 400), radius 10 tiles reaches the left edge of the right half (col 15). */
const RIGHT_HALF = { x: 1000, y: 400, radius: 10 };

function createTerrain(): TerrainGrid {
    const grid = new TerrainGrid(COLS, ROWS, CELL_SIZE, TerrainType.Grass);

    // C-shaped rock walls on the left (players defend inside the C)
    // Left wall (column 0, full height)
    for (let r = 0; r < 20; r++) {
        grid.set(0, r, TerrainType.Rock);
    }

    // Top wall of C (rows 0-1, columns 0-11)
    for (let c = 1; c < 12; c++) {
        grid.set(c, 0, TerrainType.Rock);
        grid.set(c, 1, TerrainType.Rock);
    }

    // Bottom wall of C (rows 18-19, columns 0-11)
    for (let c = 1; c < 12; c++) {
        grid.set(c, 18, TerrainType.Rock);
        grid.set(c, 19, TerrainType.Rock);
    }

    // Right wall of C — upper section (rows 2-7)
    for (let r = 2; r <= 7; r++) {
        grid.set(10, r, TerrainType.Rock);
        grid.set(11, r, TerrainType.Rock);
    }

    // Right wall of C — lower section (rows 12-17)
    for (let r = 12; r <= 17; r++) {
        grid.set(10, r, TerrainType.Rock);
        grid.set(11, r, TerrainType.Rock);
    }
    // Rows 8-11 are the chokepoint opening

    // Small rock outcrops in the open field
    grid.set(19, 5, TerrainType.Rock);
    grid.set(20, 5, TerrainType.Rock);
    grid.set(19, 6, TerrainType.Rock);
    grid.set(20, 6, TerrainType.Rock);
    grid.set(20, 7, TerrainType.Rock);

    grid.set(23, 13, TerrainType.Rock);
    grid.set(24, 13, TerrainType.Rock);
    grid.set(24, 14, TerrainType.Rock);

    grid.set(13, 7, TerrainType.Rock);
    grid.set(13, 12, TerrainType.Rock);

    // Thick grass patches in the open field
    grid.set(15, 3, TerrainType.ThickGrass);
    grid.set(16, 3, TerrainType.ThickGrass);
    grid.set(15, 4, TerrainType.ThickGrass);
    grid.set(16, 4, TerrainType.ThickGrass);
    grid.set(17, 4, TerrainType.ThickGrass);

    grid.set(17, 15, TerrainType.ThickGrass);
    grid.set(18, 15, TerrainType.ThickGrass);
    grid.set(17, 16, TerrainType.ThickGrass);
    grid.set(18, 16, TerrainType.ThickGrass);

    grid.set(25, 9, TerrainType.ThickGrass);
    grid.set(26, 9, TerrainType.ThickGrass);
    grid.set(25, 10, TerrainType.ThickGrass);
    grid.set(26, 10, TerrainType.ThickGrass);
    grid.set(26, 11, TerrainType.ThickGrass);

    // Dirt patches inside the C for variety
    grid.set(3, 5, TerrainType.Dirt);
    grid.set(4, 5, TerrainType.Dirt);
    grid.set(3, 6, TerrainType.Dirt);
    grid.set(4, 6, TerrainType.Dirt);

    grid.set(5, 13, TerrainType.Dirt);
    grid.set(6, 13, TerrainType.Dirt);
    grid.set(5, 14, TerrainType.Dirt);
    grid.set(6, 14, TerrainType.Dirt);

    return grid;
}

const ENEMIES: never[] = [];

const LEVEL_EVENTS: LevelEvent[] = [
    {
        type: 'spawnWave',
        trigger: { atRound: 1 },
        spawns: [
            { characterId: 'swarmling', spawnBehaviour: 'anywhere', spawnTarget: RIGHT_HALF, spawnCount: 10 },
        ],
    },
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 0.25, startRound: 1, endRound: 4 },
        spawns: [
            { characterId: 'swarmling', spawnBehaviour: 'anywhere', spawnTarget: RIGHT_HALF, spawnCount: 4 },
        ],
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

/** Campfire in the middle of the C: 10 HP, defense point, light so players see out and partway right. */
const SPECIAL_TILES: SpecialTilePlacement[] = [
    {
        defId: 'Campfire',
        col: 8,
        row: 10,
        defendPoint: true,
        hp: 10,
        tags: { destructible: true },
        emitsLight: { lightAmount: 6, radius: 6 },
    },
    {
        defId: 'DarkCrystal',
        col: 1,
        row: 1,
        emitsLight: { lightAmount: -5, radius: 2 },
    },
];

export class LastHoldoutMission extends BaseMissionDef {
    missionId = 'last_holdout';
    mapPosition = { x: 450, y: 250 };
    description = 'The last shelter before the end. Defend it with everything you have — there is no retreat.';
    campaignId = 'bunker_at_the_end';
    name = 'The Last Holdout';
    worldWidth = WORLD_WIDTH;
    worldHeight = WORLD_HEIGHT;
    enemies = ENEMIES;
    levelEvents = LEVEL_EVENTS;
    createTerrain = createTerrain;
    specialTiles = SPECIAL_TILES;
    aiController = 'stateBased' as const;
    lightLevelEnabled = true;
    globalLightLevel = 0;
    ninjutsuPools = { shadow: NINJUTSU_TIER_1 };
    worldModifiers = [darkSwarmModifier()];
    /** Player spawn points: eight positions inside the C-shaped bunker. */
    playerSpawnPoints = [
        { col: 9, row: 8 },
        { col: 10, row: 8 },
        { col: 9, row: 9 },
        { col: 10, row: 9 },
        { col: 9, row: 10 },
        { col: 10, row: 10 },
        { col: 9, row: 11 },
        { col: 10, row: 11 },
    ];
}

/** Mission instance for use in MISSION_MAP and mission select. */
export const LAST_HOLDOUT = new LastHoldoutMission();
