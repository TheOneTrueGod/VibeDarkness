/**
 * bezierRoad - Curved road of thickness T along a bezier curve.
 *
 * Control points are in grid units and may be fractional; the first and last are the road's end
 * cells. Pass 3 points for a quadratic curve, 4 for cubic (any count ≥ 2 works). The curve is
 * sampled, rounded to cells, joined with the straight road's 4-connected line, then thickened.
 */

import type { TerrainType } from '../TerrainType';
import { paintCells, uniqueCells, type GridCell, type GridPoint, type TerrainArray } from './paintCells';
import { lineCells, thickenCells } from './road';

/** Samples per grid unit of control-polygon length; dense enough that no cell is skipped. */
const SAMPLES_PER_TILE = 4;

/** Point on the bezier curve at `t` in [0, 1] (de Casteljau). */
export function bezierPoint(points: readonly GridPoint[], t: number): GridPoint {
    let pts = points.map((p) => ({ col: p.col, row: p.row }));
    while (pts.length > 1) {
        const next: GridPoint[] = [];
        for (let i = 0; i < pts.length - 1; i++) {
            next.push({
                col: pts[i].col + (pts[i + 1].col - pts[i].col) * t,
                row: pts[i].row + (pts[i + 1].row - pts[i].row) * t,
            });
        }
        pts = next;
    }
    return pts[0];
}

/** 4-connected centre line of cells along the curve. */
export function bezierLineCells(points: readonly GridPoint[]): GridCell[] {
    if (points.length < 2) {
        throw new Error('bezierLineCells needs at least 2 control points');
    }
    let polygonLength = 0;
    for (let i = 1; i < points.length; i++) {
        polygonLength += Math.hypot(points[i].col - points[i - 1].col, points[i].row - points[i - 1].row);
    }
    const samples = Math.max(1, Math.ceil(polygonLength * SAMPLES_PER_TILE));
    const cells: GridCell[] = [];
    let prev: GridCell | null = null;
    for (let i = 0; i <= samples; i++) {
        const p = bezierPoint(points, i / samples);
        const cell = { col: Math.round(p.col), row: Math.round(p.row) };
        if (prev && prev.col === cell.col && prev.row === cell.row) continue;
        cells.push(...(prev ? lineCells(prev, cell).slice(1) : [cell]));
        prev = cell;
    }
    return uniqueCells(cells);
}

/** Cells covered by a curved road of `thickness` along the bezier `points`. */
export function bezierRoadCells(points: readonly GridPoint[], thickness: number): GridCell[] {
    return thickenCells(bezierLineCells(points), thickness);
}

/** Returns a copy of `terrain` with a curved road of `type` painted along `points`. */
export function paintBezierRoad(
    terrain: TerrainArray,
    points: readonly GridPoint[],
    thickness: number,
    type: TerrainType,
): TerrainArray {
    return paintCells(terrain, bezierRoadCells(points, thickness), type);
}
