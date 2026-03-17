/**
 * The Last Holdout - Mission enemy and terrain definitions.
 *
 * C-shaped bunker on the left where players defend. Darkness -20; campfire in the
 * middle of the C (10 HP, defense point). Continuous spawn: 2 wolves + 1 archer
 * every 0.25 rounds from round 1 to 4, in a box on the right in darkness. Initial
 * 4 wolves + 1 archer on the right; same wave at start of round 4. Victory: defeat
 * all enemies after round 4.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import type { LevelEvent, SpecialTilePlacement } from '../../types';
import { ENEMY_DARK_WOLF, ENEMY_RANGED } from '../../../constants/enemyConstants';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';

// Grid: 30 columns × 20 rows (1200×800 world at 40px cells)
const COLS = 30;
const ROWS = 20;
const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;

/** Right-side spawn box (world coords, radius in tiles) — darkness on the right. */
const RIGHT_BOX = { x: 1000, y: 400, radius: 8 };

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

/** Initial enemies: 4 wolves + 1 archer on the right side in the darkness box. */
const ENEMIES = [
    { ...ENEMY_DARK_WOLF, name: 'Dark Wolf', position: { x: 960, y: 280 } },
    { ...ENEMY_DARK_WOLF, name: 'Dark Wolf', position: { x: 1040, y: 360 } },
    { ...ENEMY_DARK_WOLF, name: 'Dark Wolf', position: { x: 1000, y: 440 } },
    { ...ENEMY_DARK_WOLF, name: 'Dark Wolf', position: { x: 1080, y: 520 } },
    { ...ENEMY_RANGED, name: 'Archer', position: { x: 1000, y: 360 } },
];

const LEVEL_EVENTS: LevelEvent[] = [
    {
        type: 'continuousSpawn',
        trigger: { intervalRounds: 0.5, startRound: 1, endRound: 4 },
        spawns: [
            { characterId: 'dark_wolf', spawnBehaviour: 'darkness', spawnTarget: RIGHT_BOX, spawnCount: 3 },
            { characterId: 'enemy_ranged', spawnBehaviour: 'darkness', spawnTarget: RIGHT_BOX, spawnCount: 2 },
        ],
    },
    {
        type: 'spawnWave',
        trigger: { atRound: 4 },
        spawns: [
            { characterId: 'dark_wolf', spawnBehaviour: 'darkness', spawnTarget: RIGHT_BOX, spawnCount: 4 },
            { characterId: 'enemy_ranged', spawnBehaviour: 'darkness', spawnTarget: RIGHT_BOX, spawnCount: 1 },
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
        emitsLight: { lightAmount: 15, radius: 12 },
    },
];

export class LastHoldoutMission extends BaseMissionDef {
    missionId = 'last_holdout';
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
    globalLightLevel = -20;
    /** Player spawn points: eight positions inside the C-shaped bunker. */
    playerSpawnPoints = [
        { col: 3, row: 5 },
        { col: 4, row: 5 },
        { col: 3, row: 6 },
        { col: 4, row: 6 },
        { col: 5, row: 13 },
        { col: 6, row: 13 },
        { col: 5, row: 14 },
        { col: 6, row: 14 },
    ];
}

/** Mission instance for use in MISSION_MAP and mission select. */
export const LAST_HOLDOUT = new LastHoldoutMission();
