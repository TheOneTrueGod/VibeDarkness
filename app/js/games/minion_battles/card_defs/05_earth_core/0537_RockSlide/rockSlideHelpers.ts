/**
 * Rock Slide (0537) pick geometry. Imports no ability modules so the ability, its preview and its
 * tests all share one definition of where the picks land.
 *
 * Terrain checks live on TerrainManager (`isIntactRockAt`, `isInBounds`, `getEffectiveTerrainType`),
 * not here. The rock pick and direction pick hitboxes live here too.
 */

import { TERRAIN_PROPERTIES, TerrainType } from '../../../terrain/TerrainType';
import type { TerrainManager } from '../../../terrain/TerrainManager';
import { worldToTile, type TileCoord } from '../../../abilities/tileAreaHelpers';
import { TELEGRAPH_STYLES } from '../../../abilities/telegraphStyles';
import { tileAreaHitbox, tileShapes } from '../../../hitboxes/TileAreaHitboxSpec';
import { ROCK_SLIDE_ROCK_MAX_TILE_OFFSET, ROCK_SLIDE_CAST_RANGE } from '../earthCoreConstants';

/** Rock pick: one tile within 2 tiles (Chebyshev) of the caster. */
export const ROCK_PICK_HITBOX = tileAreaHitbox({
    anchor: { kind: 'chebyshev', maxTileOffset: ROCK_SLIDE_ROCK_MAX_TILE_OFFSET },
    shape: tileShapes.single(),
    castRange: ROCK_SLIDE_CAST_RANGE,
    style: TELEGRAPH_STYLES.danger,
});

/** Direction pick: the caster-adjacent cardinal tile, with the slide arrow drawn on it. */
export const DIRECTION_PICK_HITBOX = tileAreaHitbox({
    anchor: { kind: 'adjacentCardinal' },
    shape: tileShapes.single(),
    castRange: ROCK_SLIDE_CAST_RANGE,
    style: TELEGRAPH_STYLES.danger,
    directionArrow: true,
});

/** Tile of the rock pick, or null if the aim does not resolve to a tile. */
export function resolveRockTile(caster: { x: number; y: number }, aim: { x: number; y: number }): TileCoord | null {
    return ROCK_PICK_HITBOX.resolveAnchor(caster, aim);
}

/** Direction pick: the caster-adjacent cardinal tile the aim points at, plus its unit direction. */
export function resolveSlideDirection(
    caster: { x: number; y: number },
    aim: { x: number; y: number },
): { tile: TileCoord; dirCol: number; dirRow: number } | null {
    const tile = DIRECTION_PICK_HITBOX.resolveAnchor(caster, aim);
    if (!tile) return null;
    const c = worldToTile(caster.x, caster.y);
    return { tile, dirCol: tile.col - c.col, dirRow: tile.row - c.row };
}

/** The rock may spawn on `tile` iff it is in bounds, not rock and otherwise walkable. */
export function isSlideSpawnTile(tm: TerrainManager, tile: TileCoord): boolean {
    if (!tm.isInBounds(tile.col, tile.row)) return false;
    const type = tm.getEffectiveTerrainType(tile.col, tile.row);
    return type !== TerrainType.Rock && TERRAIN_PROPERTIES[type].passable;
}
