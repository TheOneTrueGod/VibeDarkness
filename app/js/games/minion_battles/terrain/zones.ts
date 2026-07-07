/**
 * Pure geometry for MapSegmentZone: resolving a zone to grid tiles, hit-testing, and
 * shifting a segment-local zone onto a mission's global grid. No passability/occupancy
 * awareness here — consumers (spawn resolution, future enter-zone triggers) filter the
 * returned tiles themselves.
 */

import type { MapSegmentZone } from './segmentSchema';

export interface GridCell {
    col: number;
    row: number;
}

interface ZoneBounds {
    minCol: number;
    maxCol: number;
    minRow: number;
    maxRow: number;
}

/** Normalizes topLeft/bottomRight so the shape resolves the same regardless of corner order. */
function normalizedBounds(zone: MapSegmentZone): ZoneBounds {
    return {
        minCol: Math.min(zone.topLeft.col, zone.bottomRight.col),
        maxCol: Math.max(zone.topLeft.col, zone.bottomRight.col),
        minRow: Math.min(zone.topLeft.row, zone.bottomRight.row),
        maxRow: Math.max(zone.topLeft.row, zone.bottomRight.row),
    };
}

/** Tile (col,row) is included when its center lies within the ellipse inscribed in [minCol..maxCol] x [minRow..maxRow]. */
function isInEllipse(col: number, row: number, bounds: ZoneBounds): boolean {
    const { minCol, maxCol, minRow, maxRow } = bounds;
    const centerX = (minCol + maxCol + 1) / 2;
    const centerY = (minRow + maxRow + 1) / 2;
    const rx = (maxCol - minCol + 1) / 2;
    const ry = (maxRow - minRow + 1) / 2;
    const dx = (col + 0.5 - centerX) / rx;
    const dy = (row + 0.5 - centerY) / ry;
    return dx * dx + dy * dy <= 1;
}

/**
 * All grid tiles covered by the zone's shape. 'box' is the inclusive bounding rect;
 * 'circle' is the ellipse inscribed in that same rect. May be empty for a malformed zone.
 */
export function resolveZoneTiles(zone: MapSegmentZone): GridCell[] {
    const bounds = normalizedBounds(zone);
    const cells: GridCell[] = [];
    for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
        for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
            if (zone.shape === 'box' || isInEllipse(col, row, bounds)) {
                cells.push({ col, row });
            }
        }
    }
    return cells;
}

/** True when (col, row) is inside the zone's shape. Kept in sync with {@link resolveZoneTiles}. */
export function isTileInZone(zone: MapSegmentZone, col: number, row: number): boolean {
    const bounds = normalizedBounds(zone);
    if (col < bounds.minCol || col > bounds.maxCol || row < bounds.minRow || row > bounds.maxRow) {
        return false;
    }
    return zone.shape === 'box' || isInEllipse(col, row, bounds);
}

/** Returns a copy of `zone` shifted by (dCol, dRow) — segment-local to mission-global. */
export function offsetZone(zone: MapSegmentZone, dCol: number, dRow: number): MapSegmentZone {
    return {
        ...zone,
        topLeft: { col: zone.topLeft.col + dCol, row: zone.topLeft.row + dRow },
        bottomRight: { col: zone.bottomRight.col + dCol, row: zone.bottomRight.row + dRow },
    };
}
