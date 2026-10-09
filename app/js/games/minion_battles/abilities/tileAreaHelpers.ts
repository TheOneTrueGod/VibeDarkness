/**
 * Tile-area targeting geometry.
 *
 * A tile area is a set of grid cells anchored to a tile the player picks. The anchor is either
 * chosen with a Chebyshev clamp around the caster (`snapSquareTileAreaCenter`) or taken from the
 * cardinal neighbour the aim points at (`snapAdjacentCardinalTile`). The cells themselves are
 * derived by `TileAreaHitboxSpec` (`hitboxes/TileAreaHitboxSpec.ts`), which is the single source of
 * geometry for the preview and for ability effects.
 *
 * Pure module: depends only on CELL_SIZE and the Unit type, so the hitbox preview, the active preview
 * and effects all snap identically.
 */

import { CELL_SIZE } from '../terrain/TerrainGrid';
import type { Unit } from '../game/units/Unit';

export interface TileCoord {
    col: number;
    row: number;
}

/** A corner of the grid. Corner (col, row) is the top-left corner of cell (col, row). */
export interface TileCorner {
    col: number;
    row: number;
}

/** A directed boundary edge between two grid corners. */
export interface TileEdge {
    from: TileCorner;
    to: TileCorner;
}

/** Cell a world point falls in. Matches `TerrainGrid.worldToGrid`. */
export function worldToTile(x: number, y: number): TileCoord {
    return { col: Math.floor(x / CELL_SIZE), row: Math.floor(y / CELL_SIZE) };
}

/** World-space centre of a tile. */
export function tileCentre(tile: TileCoord): { x: number; y: number } {
    return { x: (tile.col + 0.5) * CELL_SIZE, y: (tile.row + 0.5) * CELL_SIZE };
}

/**
 * Units whose centre sits in one of `tiles` (and that pass `predicate`, when given), in `units` order.
 *
 * Deliberately not `CellOccupancyManager`: that manager only tracks units with `maxPerTile`, and it
 * reads a snapshot taken once per tick, so it cannot answer "who is standing in these tiles right now".
 */
export function getUnitsInTiles(
    units: readonly Unit[],
    tiles: readonly TileCoord[],
    predicate?: (unit: Unit) => boolean,
): Unit[] {
    if (tiles.length === 0) return [];
    const wanted = new Set(tiles.map((t) => `${t.col},${t.row}`));
    return units.filter((unit) => {
        const tile = worldToTile(unit.x, unit.y);
        if (!wanted.has(`${tile.col},${tile.row}`)) return false;
        return predicate ? predicate(unit) : true;
    });
}

function clampInt(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v;
}

/**
 * Anchor tile of a Chebyshev-clamped tile area: the aim tile clamped so each axis offset from
 * the caster tile is within [-maxTileOffset, +maxTileOffset] (true Chebyshev — axes
 * clamped independently). `maxTileOffset` 0 => anchor is the caster's tile.
 */
export function snapSquareTileAreaCenter(
    casterX: number,
    casterY: number,
    aimX: number,
    aimY: number,
    maxTileOffset: number,
): TileCoord {
    const caster = worldToTile(casterX, casterY);
    const aim = worldToTile(aimX, aimY);
    const dCol = clampInt(aim.col - caster.col, -maxTileOffset, maxTileOffset);
    const dRow = clampInt(aim.row - caster.row, -maxTileOffset, maxTileOffset);
    return { col: caster.col + dCol, row: caster.row + dRow };
}

/**
 * The orthogonal neighbour of the caster's tile that `aim` points at, chosen by the dominant axis
 * of (aim - caster centre). Returns null when the aim sits exactly on the caster.
 */
export function snapAdjacentCardinalTile(
    casterX: number,
    casterY: number,
    aimX: number,
    aimY: number,
): TileCoord | null {
    const dx = aimX - casterX;
    const dy = aimY - casterY;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return null;
    const caster = worldToTile(casterX, casterY);
    if (Math.abs(dx) >= Math.abs(dy)) return { col: caster.col + (dx > 0 ? 1 : -1), row: caster.row };
    return { col: caster.col, row: caster.row + (dy > 0 ? 1 : -1) };
}

function cornerKey(c: TileCorner): string {
    return `${c.col},${c.row}`;
}

function edgeKey(e: TileEdge): string {
    return `${cornerKey(e.from)}>${cornerKey(e.to)}`;
}

/**
 * Boundary of a set of cells as clockwise (screen space) directed edges. An edge shared by two
 * cells appears once in each direction and cancels, so:
 *   - `outer` is the outline of the union of the cells;
 *   - `interior` is the set of boundaries between neighbouring cells (one entry per shared edge).
 * Duplicate input cells are ignored.
 */
export function getTileAreaEdges(cells: readonly TileCoord[]): { outer: TileEdge[]; interior: TileEdge[] } {
    const directed = new Map<string, TileEdge>();
    for (const cell of cells) {
        const tl: TileCorner = { col: cell.col, row: cell.row };
        const tr: TileCorner = { col: cell.col + 1, row: cell.row };
        const br: TileCorner = { col: cell.col + 1, row: cell.row + 1 };
        const bl: TileCorner = { col: cell.col, row: cell.row + 1 };
        const edges: TileEdge[] = [
            { from: tl, to: tr },
            { from: tr, to: br },
            { from: br, to: bl },
            { from: bl, to: tl },
        ];
        for (const edge of edges) directed.set(edgeKey(edge), edge);
    }

    const outer: TileEdge[] = [];
    const interior: TileEdge[] = [];
    const seenInterior = new Set<string>();
    for (const [key, edge] of directed) {
        const reverseKey = `${cornerKey(edge.to)}>${cornerKey(edge.from)}`;
        if (!directed.has(reverseKey)) {
            outer.push(edge);
            continue;
        }
        const canonical = key < reverseKey ? key : reverseKey;
        if (seenInterior.has(canonical)) continue;
        seenInterior.add(canonical);
        interior.push(edge);
    }
    return { outer, interior };
}

/**
 * Closed outline loops of a cell set, as corner points in grid units (multiply by CELL_SIZE to draw).
 * Outer edges are chained head to tail, so a single stroke over a loop gets proper joins at the
 * corners. Each loop lists its points once (the closing point is not repeated).
 */
export function getTileAreaOutlineLoops(cells: readonly TileCoord[]): TileCorner[][] {
    const { outer } = getTileAreaEdges(cells);
    const outgoing = new Map<string, TileEdge[]>();
    for (const edge of outer) {
        const key = cornerKey(edge.from);
        const list = outgoing.get(key);
        if (list) list.push(edge);
        else outgoing.set(key, [edge]);
    }

    const used = new Set<TileEdge>();
    const loops: TileCorner[][] = [];
    for (const start of outer) {
        if (used.has(start)) continue;
        const points: TileCorner[] = [start.from];
        let current: TileEdge | undefined = start;
        while (current && !used.has(current)) {
            used.add(current);
            points.push(current.to);
            current = (outgoing.get(cornerKey(current.to)) ?? []).find((e) => !used.has(e));
        }
        // The last point closes the loop back onto the first.
        loops.push(points.slice(0, -1));
    }
    return loops;
}
