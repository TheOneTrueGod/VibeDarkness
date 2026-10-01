import type { VictoryConditionAllUnitsNearPosition } from './types';

/** True when grid tile (col, row) satisfies the condition's target area. */
export function isTileInNearPositionArea(
    cond: VictoryConditionAllUnitsNearPosition,
    col: number,
    row: number,
): boolean {
    if (cond.width !== undefined || cond.height !== undefined) {
        const w = cond.width ?? 1;
        const h = cond.height ?? 1;
        return col >= cond.col && col < cond.col + w && row >= cond.row && row < cond.row + h;
    }
    const maxDist = cond.maxDistance ?? 1;
    return Math.max(Math.abs(col - cond.col), Math.abs(row - cond.row)) <= maxDist;
}

/** Every grid tile in the condition's target area. */
export function getNearPositionAreaTiles(
    cond: VictoryConditionAllUnitsNearPosition,
): { col: number; row: number }[] {
    const tiles: { col: number; row: number }[] = [];
    if (cond.width !== undefined || cond.height !== undefined) {
        const w = cond.width ?? 1;
        const h = cond.height ?? 1;
        for (let r = 0; r < h; r++) {
            for (let c = 0; c < w; c++) tiles.push({ col: cond.col + c, row: cond.row + r });
        }
        return tiles;
    }
    const d = cond.maxDistance ?? 1;
    for (let r = -d; r <= d; r++) {
        for (let c = -d; c <= d; c++) tiles.push({ col: cond.col + c, row: cond.row + r });
    }
    return tiles;
}
