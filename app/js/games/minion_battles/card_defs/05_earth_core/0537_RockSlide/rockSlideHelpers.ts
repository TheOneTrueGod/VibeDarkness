/**
 * Rock Slide (0537) pure geometry / validity helpers. Imports no ability modules so the ability,
 * its preview and its tests all share one definition of "valid pick".
 */

import { TerrainType, TERRAIN_PROPERTIES } from '../../../terrain/TerrainType';
import {
    snapSquareTileAreaCenter,
    snapAdjacentCardinalTile,
    worldToTile,
    type TileCoord,
} from '../../../abilities/tileAreaHelpers';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { ROCK_SLIDE_ROCK_MAX_TILE_OFFSET } from '../earthCoreConstants';

export interface RockSlideTerrain {
    getEffectiveTerrainType(col: number, row: number): TerrainType;
    getGridSize(): { width: number; height: number };
}

function inBounds(tm: RockSlideTerrain, t: TileCoord): boolean {
    const { width, height } = tm.getGridSize();
    return t.col >= 0 && t.row >= 0 && t.col < width && t.row < height;
}

/** Tile of the rock pick: the aim tile clamped to within 2 tiles (Chebyshev) of the caster. */
export function resolveRockTile(caster: { x: number; y: number }, aim: { x: number; y: number }): TileCoord {
    return snapSquareTileAreaCenter(caster.x, caster.y, aim.x, aim.y, ROCK_SLIDE_ROCK_MAX_TILE_OFFSET);
}

/** True if `tile` is rock (natural or player-made, per the effective terrain layers) and in bounds. */
export function isRockTile(tm: RockSlideTerrain, tile: TileCoord): boolean {
    return inBounds(tm, tile) && tm.getEffectiveTerrainType(tile.col, tile.row) === TerrainType.Rock;
}

/** Direction pick: the caster-adjacent cardinal tile the aim points at, plus its unit direction. */
export function resolveSlideDirection(
    caster: { x: number; y: number },
    aim: { x: number; y: number },
): { tile: TileCoord; dirCol: number; dirRow: number } | null {
    const tile = snapAdjacentCardinalTile(caster.x, caster.y, aim.x, aim.y);
    if (!tile) return null;
    const c = worldToTile(caster.x, caster.y);
    return { tile, dirCol: tile.col - c.col, dirRow: tile.row - c.row };
}

/** The rock may spawn on `tile` iff it is in bounds, not rock and otherwise walkable. */
export function isSlideSpawnTile(tm: RockSlideTerrain, tile: TileCoord): boolean {
    if (!inBounds(tm, tile)) return false;
    const type = tm.getEffectiveTerrainType(tile.col, tile.row);
    return type !== TerrainType.Rock && TERRAIN_PROPERTIES[type].passable;
}

export function tileCenter(tile: TileCoord): { x: number; y: number } {
    return { x: (tile.col + 0.5) * CELL_SIZE, y: (tile.row + 0.5) * CELL_SIZE };
}
