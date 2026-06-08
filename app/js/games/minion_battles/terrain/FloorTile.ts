/**
 * Floor tile model — sparse runtime overrides on top of bedrock terrain.
 *
 * Option D: terrain identity (`terrainType`) is separate from optional
 * destructibility (`destructible`). Destroyed rock becomes Rubble (passable).
 */

import { TerrainType } from './TerrainType';
import {
    DEFAULT_ROCK_DESTRUCTIBLE_KIND,
    EARTH_CORE_STONE_HEALTH,
} from '../card_defs/05_earth_core/earthCoreConstants';
import type { TerrainGrid } from './TerrainGrid';

export interface DestructibleState {
    health: number;
    maxHealth: number;
    /** Sprite / rules discriminator (e.g. 'rock'). */
    kind: string;
}

export interface FloorTile {
    terrainType: TerrainType;
    destructible?: DestructibleState;
}

export interface TerrainStoneDamagedTransition {
    col: number;
    row: number;
    worldX: number;
    worldY: number;
    previousHealth: number;
    health: number;
    maxHealth: number;
    previousTerrainType: TerrainType;
    terrainType: TerrainType;
    tier?: number;
    sourceUnitId?: string | null;
}

/** Effective terrain type: floor override or bedrock. */
export function getEffectiveTerrain(floor: FloorTile | null | undefined, bedrock: TerrainType): TerrainType {
    return floor?.terrainType ?? bedrock;
}

/** True when rock is intact (impassable stone for gameplay). */
export function isIntactRock(effective: TerrainType, destructible?: DestructibleState): boolean {
    return effective === TerrainType.Rock && (!destructible || destructible.health > 0);
}

/** Earth Core alias — "on stone" checks (excludes Rubble and destroyed rock). */
export function isOnStone(effective: TerrainType, destructible?: DestructibleState): boolean {
    return isIntactRock(effective, destructible);
}

/** No crack overlay — intact rock at full health or destroyed (rubble is separate). */
export const DAMAGE_TIER_NONE = -1;

/**
 * Sprite damage tier from health percentage (render/events only).
 * -1 = 100% (no overlay) or destroyed; 1–4 = escalating crack overlays.
 */
export function getDamageTier(destructible: DestructibleState | undefined): number {
    if (!destructible || destructible.health <= 0) return DAMAGE_TIER_NONE;
    const pct = destructible.health / destructible.maxHealth;
    if (pct >= 1) return DAMAGE_TIER_NONE;
    if (pct >= 0.75) return 1;
    if (pct >= 0.5) return 2;
    if (pct >= 0.25) return 3;
    return 4;
}

/** Default destructible state for bedrock rock on first mutation. */
export function defaultRockDestructible(maxHealth: number = EARTH_CORE_STONE_HEALTH): DestructibleState {
    return {
        health: maxHealth,
        maxHealth,
        kind: DEFAULT_ROCK_DESTRUCTIBLE_KIND,
    };
}

/** Copy bedrock into a new floor tile; attach rock destructible when bedrock is Rock. */
export function floorTileFromBedrock(bedrock: TerrainType, maxHealth: number = EARTH_CORE_STONE_HEALTH): FloorTile {
    const tile: FloorTile = { terrainType: bedrock };
    if (bedrock === TerrainType.Rock) {
        tile.destructible = defaultRockDestructible(maxHealth);
    }
    return tile;
}

/** Ensure a floor tile exists for a cell, copying bedrock when missing. */
export function ensureFloorFromBedrock(
    getFloor: (col: number, row: number) => FloorTile | null,
    setFloor: (col: number, row: number, tile: FloorTile) => void,
    col: number,
    row: number,
    grid: TerrainGrid,
    maxHealth: number = EARTH_CORE_STONE_HEALTH,
): FloorTile {
    const existing = getFloor(col, row);
    if (existing) return existing;
    const tile = floorTileFromBedrock(grid.get(col, row), maxHealth);
    setFloor(col, row, tile);
    return tile;
}
