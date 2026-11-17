/**
 * Castle spawn presets - the spawn cadence every chapter 3 castle mission picks from, plus the
 * shared spawn helpers first written for The Lonely Castle (011 re-exports them).
 *
 * A preset is data: the darkness waves it raises (each on its own round interval), the enemies that
 * start the mission at the rooms' `enemySpawn` POIs, and how many of those. `defineCastleMission`
 * turns a preset into level events (`castlePresetLevelEvents`) and opening enemies. The Lonely
 * Castle's road wave is the baseline; no preset is harsher than it.
 */

import type { EnemySpawnDef, LevelEvent, SpawnWaveEntry } from '../../../types';
import { CELL_SIZE } from '../../../../terrain/TerrainGrid';
import { ENEMY_DARK_WOLF, ENEMY_SWARMLING, ENEMY_THORNBINDER } from '../../../../constants/enemyConstants';
import { SLIME } from '../../../../game/units/dark_animals/slime';

/** Cells per side of one world-grid segment (every castle room is 22x22). */
export const SEGMENT_SIZE = 22;

/** Segment-local cell → mission grid cell, for a segment at layout slot (tileCol, tileRow). */
export function onMission(tileCol: number, tileRow: number, cell: { col: number; row: number }): { col: number; row: number } {
    return { col: tileCol * SEGMENT_SIZE + cell.col, row: tileRow * SEGMENT_SIZE + cell.row };
}

/** World-space centre of a grid cell. */
export function cellCentre(cell: { col: number; row: number }): { x: number; y: number } {
    return { x: cell.col * CELL_SIZE + CELL_SIZE / 2, y: cell.row * CELL_SIZE + CELL_SIZE / 2 };
}

// --- Stacks --------------------------------------------------------------
// Wolves and swarmlings come in unit stacks (The Lonely Castle is where the player first meets
// them). Wave counts are tokens; a stack token holds `*_STACK_SIZE` creatures.
/** Creatures per wolf token. */
export const WOLF_STACK_SIZE = 2;
/** Creatures per stacked swarmling token. */
export const SWARMLING_STACK_SIZE = 2;

/**
 * A darkness-risen enemy entry: `count` tokens, optionally confined to a segment zone, each a unit stack of
 * `stackSize` creatures when given.
 */
export function darknessSpawn(
    template: EnemySpawnDef,
    count: number,
    opts: { spawnZoneId?: string; stackSize?: number } = {},
): SpawnWaveEntry {
    return {
        characterId: template.characterId,
        name: template.name,
        spawnBehaviour: 'anywhere',
        inDarkness: true,
        ...(opts.spawnZoneId != null ? { spawnZoneId: opts.spawnZoneId } : {}),
        ...(opts.stackSize != null && opts.stackSize > 1 ? { stackSize: opts.stackSize } : {}),
        spawnCount: count,
        unitAITreeId: template.unitAITreeId,
    };
}

// --- The road wave (The Lonely Castle baseline) ----------------------------
/** The per-round darkness wave on the road. Its one swarmling is a lone unit, not a stack. */
export const ROAD_WAVE_WOLVES = 1;
export const ROAD_WAVE_SWARMLINGS = 1;
export const ROAD_WAVE_SLIMES = 1;

/** The Lonely Castle's per-round darkness wave: a wolf stack, a lone swarmling and a slime. */
export function roadDarknessWave(): SpawnWaveEntry[] {
    return [
        darknessSpawn(ENEMY_DARK_WOLF, ROAD_WAVE_WOLVES, { stackSize: WOLF_STACK_SIZE }),
        darknessSpawn(ENEMY_SWARMLING, ROAD_WAVE_SWARMLINGS),
        darknessSpawn(SLIME, ROAD_WAVE_SLIMES),
    ];
}

// --- Presets -------------------------------------------------------------
export type CastleSpawnPresetId = 'castle_standard' | 'castle_explore' | 'castle_boss' | 'castle_boss_alone';

/** One repeating darkness wave: `spawns` rise every `intervalRounds` rounds. */
export interface CastleWaveDef {
    intervalRounds: number;
    spawns: readonly SpawnWaveEntry[];
}

/** One opening enemy kind: a template, optionally as a unit stack. */
export interface CastleOpeningEnemyDef {
    template: EnemySpawnDef;
    stackSize?: number;
}

export interface CastleSpawnPresetDef {
    id: CastleSpawnPresetId;
    /** Repeating darkness waves. They stop when the mission's exit objective completes. */
    waves: readonly CastleWaveDef[];
    /** Opening enemies, dealt out one per `enemySpawn` POI in order, cycling through this list. */
    opening: readonly CastleOpeningEnemyDef[];
    /** Most opening enemies (tokens) the mission starts with. */
    openingMax: number;
    /** `enemySpawn` POIs closer than this (tiles, Chebyshev) to the party's entry get no opening enemy. */
    openingMinDistanceFromEntryTiles: number;
}

/** Opening enemies keep a room's length away from where the party comes in. */
const OPENING_MIN_DISTANCE_FROM_ENTRY_TILES = 8;

/** A Thornbinder rises with every third `castle_standard` round. */
export const CASTLE_STANDARD_THORNBINDER_INTERVAL_ROUNDS = 3;
/** `castle_explore` raises the road wave every second round. */
export const CASTLE_EXPLORE_WAVE_INTERVAL_ROUNDS = 2;

export const CASTLE_SPAWN_PRESETS: Readonly<Record<CastleSpawnPresetId, CastleSpawnPresetDef>> = {
    /** The road wave every round, a Thornbinder every third round; a wolf stack and a slime waiting. */
    castle_standard: {
        id: 'castle_standard',
        waves: [
            { intervalRounds: 1, spawns: roadDarknessWave() },
            {
                intervalRounds: CASTLE_STANDARD_THORNBINDER_INTERVAL_ROUNDS,
                spawns: [darknessSpawn(ENEMY_THORNBINDER, 1)],
            },
        ],
        opening: [{ template: ENEMY_DARK_WOLF, stackSize: WOLF_STACK_SIZE }, { template: SLIME }],
        openingMax: 2,
        openingMinDistanceFromEntryTiles: OPENING_MIN_DISTANCE_FROM_ENTRY_TILES,
    },
    /** The same road wave, every second round: room to look around. */
    castle_explore: {
        id: 'castle_explore',
        waves: [{ intervalRounds: CASTLE_EXPLORE_WAVE_INTERVAL_ROUNDS, spawns: roadDarknessWave() }],
        opening: [{ template: ENEMY_DARK_WOLF, stackSize: WOLF_STACK_SIZE }, { template: SLIME }],
        openingMax: 2,
        openingMinDistanceFromEntryTiles: OPENING_MIN_DISTANCE_FROM_ENTRY_TILES,
    },
    /** No waves and no escort: the boss fight is the boss alone (the Garden Heart's plant is the fight). */
    castle_boss_alone: {
        id: 'castle_boss_alone',
        waves: [],
        opening: [],
        openingMax: 0,
        openingMinDistanceFromEntryTiles: OPENING_MIN_DISTANCE_FROM_ENTRY_TILES,
    },
    /** No waves: one wolf stack waiting as the boss's escort. */
    castle_boss: {
        id: 'castle_boss',
        waves: [],
        opening: [{ template: ENEMY_DARK_WOLF, stackSize: WOLF_STACK_SIZE }],
        openingMax: 1,
        openingMinDistanceFromEntryTiles: OPENING_MIN_DISTANCE_FROM_ENTRY_TILES,
    },
};

/** The preset's waves as `continuousSpawn` level events, each stopping at `untilObjective` when given. */
export function castlePresetLevelEvents(
    preset: CastleSpawnPresetDef,
    opts: { untilObjective?: string } = {},
): LevelEvent[] {
    return preset.waves.map((wave): LevelEvent => ({
        type: 'continuousSpawn',
        trigger: { intervalRounds: wave.intervalRounds },
        ...(opts.untilObjective != null ? { untilObjective: opts.untilObjective } : {}),
        spawns: wave.spawns.map((entry) => ({ ...entry })),
    }));
}

/**
 * The opening enemies for a preset, given the mission's `enemySpawn` cells (mission-global, in POI
 * order) and the party's entry cell. Positions are cell centres; the caller moves any that land on
 * blocked ground.
 */
export function castleOpeningEnemies(
    preset: CastleSpawnPresetDef,
    spawnCells: readonly { col: number; row: number }[],
    entry: { col: number; row: number },
): EnemySpawnDef[] {
    if (preset.opening.length === 0) return [];
    const far = spawnCells.filter(
        (c) => Math.max(Math.abs(c.col - entry.col), Math.abs(c.row - entry.row)) >= preset.openingMinDistanceFromEntryTiles,
    );
    return far.slice(0, preset.openingMax).map((cell, i) => {
        const kind = preset.opening[i % preset.opening.length]!;
        return {
            ...kind.template,
            position: cellCentre(cell),
            ...(kind.stackSize != null && kind.stackSize > 1 ? { stackSize: kind.stackSize } : {}),
        };
    });
}
