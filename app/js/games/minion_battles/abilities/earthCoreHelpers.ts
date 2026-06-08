import { EARTH_CORE_SHARED_DIAMETER } from '../card_defs/05_earth_core/earthCoreConstants';
import type { DestructibleState } from '../terrain/FloorTile';
import { isOnStone as isOnStoneTile } from '../terrain/FloorTile';
import { TerrainType } from '../terrain/TerrainType';

/**
 * Shared radius derived from Earth Core's gameplay diameter (in tile units).
 */
export function getEarthCoreSharedRadiusTiles(): number {
    return EARTH_CORE_SHARED_DIAMETER / 2;
}

/**
 * True when effective terrain counts as "on stone" for Earth Core (intact rock).
 * Rubble and destroyed rock are excluded.
 */
export function isOnStone(effectiveTerrainType: TerrainType, destructible?: DestructibleState): boolean {
    return isOnStoneTile(effectiveTerrainType, destructible);
}

/**
 * Distance check in tile-space using Euclidean distance between tile centers.
 * Coordinates are grid column/row values.
 */
export function isWithinEarthCoreSharedDiameterByTileDistance(
    fromCol: number,
    fromRow: number,
    toCol: number,
    toRow: number,
): boolean {
    const dx = toCol - fromCol;
    const dy = toRow - fromRow;
    const distance = Math.sqrt((dx * dx) + (dy * dy));
    return distance <= getEarthCoreSharedRadiusTiles();
}

/**
 * Tremorsense range check using the shared Earth Core diameter.
 */
export function isWithinEarthCoreTremorsenseRange(
    unitCol: number,
    unitRow: number,
    targetCol: number,
    targetRow: number,
): boolean {
    return isWithinEarthCoreSharedDiameterByTileDistance(unitCol, unitRow, targetCol, targetRow);
}

/**
 * Nearby stone-damaged trigger range check using the shared Earth Core diameter.
 */
export function isWithinEarthCoreNearbyStoneDamagedRange(
    unitCol: number,
    unitRow: number,
    damagedStoneCol: number,
    damagedStoneRow: number,
): boolean {
    return isWithinEarthCoreSharedDiameterByTileDistance(
        unitCol,
        unitRow,
        damagedStoneCol,
        damagedStoneRow,
    );
}
