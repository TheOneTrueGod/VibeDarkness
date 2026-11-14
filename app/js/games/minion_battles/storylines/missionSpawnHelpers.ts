/**
 * Mission spawn utilities - deterministic-but-scattered placement for pre-placed enemies, and
 * terrain-aware open-cell picking for party arrivals and units placed beside a point.
 */

import type { GameEngine } from '../game/GameEngine';
import { CELL_SIZE, type TerrainGrid } from '../terrain/TerrainGrid';
import { TERRAIN_PROPERTIES } from '../terrain/TerrainType';

const MIN_SEPARATION_PX = CELL_SIZE;
const PLACEMENT_ATTEMPTS = 20;

/**
 * Scatters `count` world positions inside a circle (radius in tiles), using the engine's
 * seeded RNG so every client computes the same layout. Not terrain-aware — only use this
 * for target circles known to be open, passable ground.
 */
export function scatterPositionsInCircle(
    engine: GameEngine,
    target: { x: number; y: number; radius: number },
    count: number,
): { x: number; y: number }[] {
    const radiusPx = target.radius * CELL_SIZE;
    const positions: { x: number; y: number }[] = [];

    for (let i = 0; i < count; i++) {
        let candidate = { x: target.x, y: target.y };
        for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
            const angle = (engine.generateRandomInteger(0, 359) * Math.PI) / 180;
            const r = radiusPx * Math.sqrt(engine.generateRandomInteger(0, 1000) / 1000);
            candidate = { x: target.x + Math.cos(angle) * r, y: target.y + Math.sin(angle) * r };
            const tooClose = positions.some((p) => {
                const dx = p.x - candidate.x;
                const dy = p.y - candidate.y;
                return dx * dx + dy * dy < MIN_SEPARATION_PX * MIN_SEPARATION_PX;
            });
            if (!tooClose) break;
        }
        positions.push(candidate);
    }

    return positions;
}

/** Offsets of a 4x2 block (nearest first), the party's usual arrival shape. */
export const PARTY_BLOCK_OFFSETS: readonly (readonly [number, number])[] = [
    [0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [-1, 1], [2, 0], [2, 1],
];

/** Most cells `openCellsNear` searches before giving up (a few rooms' worth). */
const OPEN_CELL_SEARCH_LIMIT = 2000;

/**
 * Up to `count` passable cells near `cell` that a unit standing there could walk to. Cells come from
 * `preferredOffsets` first (in order, when open and reachable), then by walking distance. When `cell`
 * itself is blocked the search starts from the nearest open cell. Deterministic: no RNG.
 */
export function openCellsNear(
    grid: Pick<TerrainGrid, 'get' | 'width' | 'height'>,
    cell: { col: number; row: number },
    count: number,
    preferredOffsets: readonly (readonly [number, number])[] = [],
): { col: number; row: number }[] {
    const open = (c: number, r: number) =>
        c >= 0 && r >= 0 && c < grid.width && r < grid.height && TERRAIN_PROPERTIES[grid.get(c, r)].passable;
    const start = open(cell.col, cell.row) ? cell : nearestOpenCell(open, cell, Math.max(grid.width, grid.height));
    if (!start || count <= 0) return [];

    // Breadth-first over open cells (4-neighbour), so every result is reachable from the start.
    const key = (c: number, r: number) => r * grid.width + c;
    const order: { col: number; row: number }[] = [start];
    const seen = new Set<number>([key(start.col, start.row)]);
    for (let i = 0; i < order.length && order.length < OPEN_CELL_SEARCH_LIMIT; i++) {
        const { col, row } = order[i]!;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const c = col + dc;
            const r = row + dr;
            if (!open(c, r) || seen.has(key(c, r))) continue;
            seen.add(key(c, r));
            order.push({ col: c, row: r });
        }
    }

    const out: { col: number; row: number }[] = [];
    const taken = new Set<number>();
    const take = (c: { col: number; row: number }) => {
        if (out.length >= count || taken.has(key(c.col, c.row))) return;
        taken.add(key(c.col, c.row));
        out.push({ col: c.col, row: c.row });
    };
    for (const [dc, dr] of preferredOffsets) {
        const c = start.col + dc;
        const r = start.row + dr;
        if (seen.has(key(c, r))) take({ col: c, row: r });
    }
    for (const c of order) take(c);
    return out;
}

/** The open cell nearest `cell` by Chebyshev ring (row-major within a ring), or null. */
function nearestOpenCell(
    open: (c: number, r: number) => boolean,
    cell: { col: number; row: number },
    maxRadius: number,
): { col: number; row: number } | null {
    for (let d = 1; d <= maxRadius; d++) {
        for (let r = cell.row - d; r <= cell.row + d; r++) {
            for (let c = cell.col - d; c <= cell.col + d; c++) {
                if (Math.max(Math.abs(c - cell.col), Math.abs(r - cell.row)) !== d) continue;
                if (open(c, r)) return { col: c, row: r };
            }
        }
    }
    return null;
}
