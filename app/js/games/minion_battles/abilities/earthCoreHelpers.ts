import { EARTH_CORE_SHARED_DIAMETER } from '../card_defs/05_earth_core/earthCoreConstants';
import { getEffectiveTerrain, isOnStone as isOnStoneTile, type DestructibleState, type FloorTile } from '../terrain/FloorTile';
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

/** The slice of `TerrainManager` that {@link isUnitOnStone} reads (lets tests pass a small stub). */
export interface StoneQueryTerrain {
    grid: {
        worldToGrid(x: number, y: number): { col: number; row: number };
        get(col: number, row: number): TerrainType;
    };
    getFloorTile(col: number, row: number): FloorTile | null;
}

/**
 * True when a unit stands on intact stone (its tile's effective terrain, floor layer included, is
 * intact rock). The shared "on stone" check for Earth Core damage riders (Earthern Punch, Anchored
 * Tremor). Rubble and destroyed rock do not count; no terrain manager means no stone.
 */
export function isUnitOnStone(
    terrain: StoneQueryTerrain | null | undefined,
    unit: { x: number; y: number },
): boolean {
    if (!terrain) return false;
    const cell = terrain.grid.worldToGrid(unit.x, unit.y);
    const floor = terrain.getFloorTile(cell.col, cell.row);
    const effective = getEffectiveTerrain(floor, terrain.grid.get(cell.col, cell.row));
    return isOnStone(effective, floor?.destructible);
}
