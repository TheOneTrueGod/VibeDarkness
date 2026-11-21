/**
 * Nudging a wanted point onto passable ground: used wherever something is placed or moved to a computed spot (grown
 * nodes, burrow destinations) so authors and rules need not hand-check every point on every map.
 */

import { CELL_SIZE } from '../../terrain/TerrainGrid';

/** Search radius (in tiles) around the wanted spot for passable ground. */
const NUDGE_RADIUS_TILES = 3;

/** The wanted point if it is passable ground, else the nearest passable tile centre within a few tiles, else the wanted point. */
export function nearestPassablePoint(
    terrain: { isPassable(x: number, y: number): boolean } | null,
    x: number,
    y: number,
): { x: number; y: number } {
    if (!terrain || terrain.isPassable(x, y)) return { x, y };
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    const col0 = Math.floor(x / CELL_SIZE);
    const row0 = Math.floor(y / CELL_SIZE);
    for (let dr = -NUDGE_RADIUS_TILES; dr <= NUDGE_RADIUS_TILES; dr++) {
        for (let dc = -NUDGE_RADIUS_TILES; dc <= NUDGE_RADIUS_TILES; dc++) {
            const cx = (col0 + dc + 0.5) * CELL_SIZE;
            const cy = (row0 + dr + 0.5) * CELL_SIZE;
            if (!terrain.isPassable(cx, cy)) continue;
            const d = Math.hypot(cx - x, cy - y);
            if (d < bestDist) {
                bestDist = d;
                best = { x: cx, y: cy };
            }
        }
    }
    return best ?? { x, y };
}
