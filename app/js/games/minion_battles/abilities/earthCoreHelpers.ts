import { EARTH_CORE_SHARED_DIAMETER } from '../constants/earthCoreConstants';
import type { StoneTileState } from '../terrain/TerrainGrid';

/**
 * Earth Core treats these as "stone" for passive/trigger logic.
 * spent_rubble is intentionally excluded.
 */
const EARTH_CORE_ACTIVE_STONE_STATES: ReadonlySet<StoneTileState> = new Set([
    'natural_stone',
    'created_rock',
    'cracked_rock',
]);

/**
 * Shared radius derived from Earth Core's gameplay diameter (in tile units).
 */
export function getEarthCoreSharedRadiusTiles(): number {
    return EARTH_CORE_SHARED_DIAMETER / 2;
}

/**
 * True when a stone tile state counts as "on stone" for Earth Core.
 */
export function isEarthCoreStoneState(state: StoneTileState): boolean {
    return EARTH_CORE_ACTIVE_STONE_STATES.has(state);
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
