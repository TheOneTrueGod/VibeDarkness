/**
 * Chapter 3 ("The Lonely Castle") Mission Map: nodes sit on the castle's world-grid tiles, drawn
 * over a background built from the castle segments (see `WOD_CH3_MAP_BACKGROUND`).
 *
 * One world-grid address (one 22x22 segment) is a `WOD_CH3_TILE_PX` square. The block covers
 * cols 58-64 and rows 43-50, so it includes the cave road south of the gate (row 50).
 */
import type { SegmentGridMapBackgroundDef } from '../types';

/** Map-space edge length of one world-grid tile. */
export const WOD_CH3_TILE_PX = 120;

/** World-grid address of the background's top-left tile. */
export const WOD_CH3_MAP_COL0 = 58;
export const WOD_CH3_MAP_ROW0 = 43;
export const WOD_CH3_MAP_COLS = 7; // 58-64
export const WOD_CH3_MAP_ROWS = 8; // 43-50

/** Map-space position of the top-left corner of tile (`WOD_CH3_MAP_COL0`, `WOD_CH3_MAP_ROW0`). */
export const WOD_CH3_MAP_ORIGIN_X = 0;
export const WOD_CH3_MAP_ORIGIN_Y = 0;

/**
 * Map-space centre of world-grid tile (`col`, `row`). Fractions are allowed, so a node can sit
 * between tiles (e.g. `castleMapPosition(60.5, 50)` is on the 60_50 / 61_50 seam).
 */
export function castleMapPosition(col: number, row: number): { x: number; y: number } {
    return {
        x: WOD_CH3_MAP_ORIGIN_X + (col - WOD_CH3_MAP_COL0 + 0.5) * WOD_CH3_TILE_PX,
        y: WOD_CH3_MAP_ORIGIN_Y + (row - WOD_CH3_MAP_ROW0 + 0.5) * WOD_CH3_TILE_PX,
    };
}

/** Cells along one side of a world-grid tile (one segment). */
export const WOD_CH3_TILE_CELLS = 22;

/**
 * Fewest map-space px between two node centres that sit side by side: the node circle's diameter
 * (2 x 28) plus a gap, so neither circle covers the other.
 */
export const WOD_CH3_MIN_NODE_GAP_PX = 72;

/** Map-space centre of segment-local cell (`localCol`, `localRow`) inside tile (`col`, `row`). */
export function castleCellMapPosition(col: number, row: number, localCol: number, localRow: number): { x: number; y: number } {
    return castleMapPosition(
        col + (localCol + 0.5) / WOD_CH3_TILE_CELLS - 0.5,
        row + (localRow + 0.5) / WOD_CH3_TILE_CELLS - 0.5,
    );
}

/**
 * Two node positions side by side: `a` and `b`, pushed apart about their midpoint along the line
 * between them until they are at least `minGap` apart (unchanged when they already are).
 */
export function sideBySideMapPositions(
    a: { x: number; y: number },
    b: { x: number; y: number },
    minGap: number = WOD_CH3_MIN_NODE_GAP_PX,
): [{ x: number; y: number }, { x: number; y: number }] {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= minGap) return [{ ...a }, { ...b }];
    const [ux, uy] = dist > 0 ? [dx / dist, dy / dist] : [1, 0];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const half = minGap / 2;
    return [
        { x: mx - ux * half, y: my - uy * half },
        { x: mx + ux * half, y: my + uy * half },
    ];
}

/** Chapter 3 `mapBackground`: every registered segment in cols 58-64 x rows 43-50. */
export const WOD_CH3_MAP_BACKGROUND: SegmentGridMapBackgroundDef = {
    kind: 'segmentGrid',
    col0: WOD_CH3_MAP_COL0,
    row0: WOD_CH3_MAP_ROW0,
    cols: WOD_CH3_MAP_COLS,
    rows: WOD_CH3_MAP_ROWS,
    tilePx: WOD_CH3_TILE_PX,
    originX: WOD_CH3_MAP_ORIGIN_X,
    originY: WOD_CH3_MAP_ORIGIN_Y,
    opacity: 0.6,
};
