/**
 * Swarm Pressure — stress-test mission (Bunker at the End #2).
 *
 * Same layout as The Last Holdout with a narrowed C-bunker chokepoint (cols 10–11,
 * rows 9–10) and a dense opening pack in {@link ENEMY_SPAWN_ZONE}: wolves + slimes,
 * then a swarmling on every remaining passable tile in the zone.
 */

import { BaseMissionDef, type InitializeGameStateParams } from '../../BaseMissionDef';
import type { GameEngine } from '../../../game/GameEngine';
import { NINJUTSU_TIER_1 } from '../../../game/ninjutsu/ninjutsuConfig';
import type { EnemySpawnDef, LevelEvent, SpecialTilePlacement } from '../../types';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType, TERRAIN_PROPERTIES } from '../../../terrain/TerrainType';
import type { MapSegmentZone } from '../../../terrain/segmentSchema';
import { resolveZoneTiles } from '../../../terrain/zones';
import {
    ENEMY_DARK_WOLF,
    ENEMY_SWARMLING,
    SLIME,
} from '../../../constants/enemyConstants';

// Grid: 30 columns × 20 rows (1200×800 world at 40px cells) — matches Last Holdout
const COLS = 30;
const ROWS = 20;
const WORLD_WIDTH = COLS * CELL_SIZE;
const WORLD_HEIGHT = ROWS * CELL_SIZE;

/** Opening pack sizes (pre-placed; not spawnWave). */
export const OPENING_WOLF_COUNT = 5;
export const OPENING_SLIME_COUNT = 6;

/**
 * Enemy spawning zone: right field (row 4 col 13 → row 17 col 29), inclusive box.
 */
export const ENEMY_SPAWN_ZONE: MapSegmentZone = {
    id: 'enemy_spawn_zone',
    shape: 'box',
    topLeft: { col: 13, row: 4 },
    bottomRight: { col: 29, row: 17 },
};

function gridToWorld(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
}

function createTerrain(): TerrainGrid {
    const grid = new TerrainGrid(COLS, ROWS, CELL_SIZE, TerrainType.Grass);

    // C-shaped rock walls on the left (players defend inside the C)
    for (let r = 0; r < 20; r++) {
        grid.set(0, r, TerrainType.Rock);
    }

    for (let c = 1; c < 12; c++) {
        grid.set(c, 0, TerrainType.Rock);
        grid.set(c, 1, TerrainType.Rock);
    }

    for (let c = 1; c < 12; c++) {
        grid.set(c, 18, TerrainType.Rock);
        grid.set(c, 19, TerrainType.Rock);
    }

    // Right wall of C — upper section (through row 8; Last Holdout stopped at row 7)
    for (let r = 2; r <= 8; r++) {
        grid.set(10, r, TerrainType.Rock);
        grid.set(11, r, TerrainType.Rock);
    }

    // Right wall of C — lower section (from row 11; Last Holdout started at row 12)
    for (let r = 11; r <= 17; r++) {
        grid.set(10, r, TerrainType.Rock);
        grid.set(11, r, TerrainType.Rock);
    }

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

function passableZoneTiles(terrain: TerrainGrid): { col: number; row: number }[] {
    return resolveZoneTiles(ENEMY_SPAWN_ZONE).filter((t) =>
        TERRAIN_PROPERTIES[terrain.get(t.col, t.row)].passable,
    );
}

/**
 * Pick `count` unique tiles from `candidates` (mutates the array via splice), using the
 * engine's seeded RNG so clients place identically.
 */
function takeRandomTiles(
    engine: GameEngine,
    candidates: { col: number; row: number }[],
    count: number,
): { col: number; row: number }[] {
    const picked: { col: number; row: number }[] = [];
    for (let i = 0; i < count && candidates.length > 0; i++) {
        const idx = engine.generateRandomInteger(0, candidates.length - 1);
        picked.push(candidates.splice(idx, 1)[0]!);
    }
    return picked;
}

/**
 * 5 wolves + 6 slimes in {@link ENEMY_SPAWN_ZONE}, then one swarmling on every
 * remaining passable tile in the zone (pre-placed).
 */
function buildOpeningEnemies(engine: GameEngine, terrain: TerrainGrid): EnemySpawnDef[] {
    const candidates = passableZoneTiles(terrain);
    const packTiles = takeRandomTiles(
        engine,
        candidates,
        OPENING_WOLF_COUNT + OPENING_SLIME_COUNT,
    );
    const out: EnemySpawnDef[] = [];

    for (let i = 0; i < packTiles.length; i++) {
        const tile = packTiles[i]!;
        const position = gridToWorld(tile.col, tile.row);
        if (i < OPENING_WOLF_COUNT) {
            out.push({ ...ENEMY_DARK_WOLF, position, unitAITreeId: 'hunt' });
        } else {
            out.push({ ...SLIME, position, unitAITreeId: 'hunt' });
        }
    }

    // Fill the rest of the zone — one swarmling per leftover passable tile.
    for (const tile of candidates) {
        out.push({
            ...ENEMY_SWARMLING,
            position: gridToWorld(tile.col, tile.row),
            unitAITreeId: 'hunt',
        });
    }

    return out;
}

const LEVEL_EVENTS: LevelEvent[] = [
    {
        type: 'victoryCheck',
        trigger: { afterRound: 1 },
        conditions: [{ type: 'eliminateAllEnemies' }],
        emittedMessage: 'Eliminate all enemies to win',
        emittedByNpcId: '1',
        missionResult: 'victory',
    },
];

/** Campfire in the middle of the C (same as Last Holdout). */
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

export class SwarmPressureMission extends BaseMissionDef {
    missionId = 'swarm_pressure';
    mapPosition = { x: 650, y: 250 };
    missionType = 'battle' as const;
    description =
        'Stress test: a narrowed bunker choke and a dense opening pack in the eastern spawn zone.';
    campaignId = 'bunker_at_the_end';
    name = 'Swarm Pressure';
    worldWidth = WORLD_WIDTH;
    worldHeight = WORLD_HEIGHT;
    enemies: EnemySpawnDef[] = [];
    levelEvents = LEVEL_EVENTS;
    createTerrain = createTerrain;
    specialTiles = SPECIAL_TILES;
    aiController = 'stateBased' as const;
    lightLevelEnabled = true;
    globalLightLevel = 0;
    ninjutsuPools = { shadow: NINJUTSU_TIER_1 };
    /** Inside the C (col 10 is the narrowed choke / rock wall — do not spawn there). */
    playerSpawnPoints = [
        { col: 8, row: 8 },
        { col: 9, row: 8 },
        { col: 8, row: 9 },
        { col: 9, row: 9 },
        { col: 7, row: 10 },
        { col: 9, row: 10 },
        { col: 8, row: 11 },
        { col: 9, row: 11 },
    ];

    override initializeGameState(engine: GameEngine, params: InitializeGameStateParams): void {
        const terrain = params.terrainManager?.grid ?? this.createTerrain();
        this.enemies = buildOpeningEnemies(engine, terrain);
        super.initializeGameState(engine, params);
    }
}

/** Mission instance for use in MISSION_MAP and mission select. */
export const SWARM_PRESSURE = new SwarmPressureMission();
