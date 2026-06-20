/**
 * The Last Holdout - Mission enemy and terrain definitions.
 *
 * C-shaped bunker on the left where players defend. Darkness -20; campfire in the
 * middle of the C (10 HP, defense point). Continuous spawn: 4 swarmlings randomly
 * scattered in the right half of the map every 0.25 rounds. Victory: defeat all
 * enemies after round 4.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import type { LevelEvent, SpecialTilePlacement } from '../../types';
import type { WorldModifierDef } from '../../../worldModifiers/types';
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
        emitsLight: { lightAmount: 15, radius: 12 },
    },
];

/** Dark Swarm: each swarmling death leaves a pocket of darkness for 5 rounds. */
export const DARK_SWARM_MODIFIER: WorldModifierDef = {
    id: 'dark_swarm',
    name: 'Dark Swarm',
    description: 'When a Swarmling dies, it releases a burst of darkness at its death site for 5 rounds.',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#0d0024"/><ellipse cx="9" cy="9" rx="2.5" ry="2" fill="#6b21a8"/><ellipse cx="15" cy="9" rx="2" ry="1.5" fill="#6b21a8"/><ellipse cx="12" cy="15" rx="3" ry="2" fill="#6b21a8"/><ellipse cx="7" cy="14" rx="1.5" ry="1.5" fill="#6b21a8"/><ellipse cx="17" cy="14" rx="1.5" ry="1.5" fill="#6b21a8"/></svg>',
    rules: {
        on_unit_died: [
            {
                conditions: [{ type: 'victimCharacterIdIs', characterId: 'swarmling' }],
                effects: [
                    {
                        type: 'spawnLightSource',
                        lightAmount: -4,
                        radius: 2,
                        durationRounds: 5,
                        position: 'victim',
                    },
                ],
            },
        ],
    },
};

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
    worldModifiers = [DARK_SWARM_MODIFIER];
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
