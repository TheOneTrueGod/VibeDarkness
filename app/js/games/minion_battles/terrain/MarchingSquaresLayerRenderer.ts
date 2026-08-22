import { TerrainLayerRenderer } from './TerrainLayerRenderer';
import { TerrainType, TERRAIN_PROPERTIES } from './TerrainType';

/** Four cells that share vertex (vx, vy): NW, NE, SW, SE. */
const VERTEX_CELL_OFFSETS = [
    [-1, -1],
    [0, -1],
    [-1, 0],
    [0, 0],
] as const;

const CARDINAL_OFFSETS = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
] as const;

/** Marching-squares bit for the top-left vertex (TL << 3). */
export const MARCHING_SQUARE_TL = 8;
/** Marching-squares bit for the top-right vertex (TR << 2). */
export const MARCHING_SQUARE_TR = 4;
/** Marching-squares bit for the bottom-right vertex (BR << 1). */
export const MARCHING_SQUARE_BR = 2;
/** Marching-squares bit for the bottom-left vertex (BL << 0). */
export const MARCHING_SQUARE_BL = 1;
export const MARCHING_SQUARE_NONE = 0;
export const MARCHING_SQUARE_ALL =
    MARCHING_SQUARE_TL | MARCHING_SQUARE_TR | MARCHING_SQUARE_BR | MARCHING_SQUARE_BL;
/** Cardinal east grass of a dirt cell: left half (vertical dirt/grass edge). */
export const MARCHING_SQUARE_LEFT = MARCHING_SQUARE_TL | MARCHING_SQUARE_BL;
/** Grass north of a dirt run: bottom half (horizontal dirt/grass edge). */
export const MARCHING_SQUARE_BOTTOM = MARCHING_SQUARE_BL | MARCHING_SQUARE_BR;

function cellTouchesBlocker(
    col: number,
    row: number,
    getTypeAt: (c: number, r: number) => TerrainType,
    inGrid: (c: number, r: number) => boolean,
): boolean {
    for (const [dc, dr] of CARDINAL_OFFSETS) {
        const nc = col + dc;
        const nr = row + dr;
        if (!inGrid(nc, nr)) continue;
        if (TERRAIN_PROPERTIES[getTypeAt(nc, nr)].blocksBleed) return true;
    }
    return false;
}

/**
 * Marching-squares case for `terrainType` when painting cell (col, row).
 *
 * A vertex is inside if any of its 4 cells match `terrainType`. Rock is not a
 * same-material neighbour. On a grass cell that hugs rock, dirt at a rock-corner
 * vertex is ignored so the grass/dirt triangle sits on the open side of the cell
 * (horizontally opposite the wall), not against the rock face.
 *
 * Out-of-bounds cells are neither a type match nor a wall (the map edge is not a
 * rendered rock face). Pass `isInBounds` so OOB Rock from TerrainGrid.get is ignored.
 */
export function marchingSquareCase(
    col: number,
    row: number,
    terrainType: TerrainType,
    getTypeAt: (c: number, r: number) => TerrainType,
    isInBounds?: (c: number, r: number) => boolean,
): number {
    const inGrid = (c: number, r: number): boolean => (isInBounds ? isInBounds(c, r) : true);

    const huggingBlocker =
        getTypeAt(col, row) !== terrainType && cellTouchesBlocker(col, row, getTypeAt, inGrid);

    const vertexInside = (vx: number, vy: number): boolean => {
        let hasType = false;
        let hasBlocker = false;
        let hasTypeOnCell = false;
        let hasTypeDiagonalToCell = false;

        for (const [dx, dy] of VERTEX_CELL_OFFSETS) {
            const cx = vx + dx;
            const cy = vy + dy;
            if (!inGrid(cx, cy)) continue;
            const t = getTypeAt(cx, cy);
            if (TERRAIN_PROPERTIES[t].blocksBleed) {
                hasBlocker = true;
            }
            if (t !== terrainType) continue;
            hasType = true;
            if (cx === col && cy === row) {
                hasTypeOnCell = true;
            } else if (Math.abs(cx - col) === 1 && Math.abs(cy - row) === 1) {
                hasTypeDiagonalToCell = true;
            }
        }

        if (huggingBlocker) {
            // Ignore dirt that shares a vertex with the rock so the triangle is
            // the horizontal mirror of a rock-adjacent corner (open side of the cell).
            return hasType && !hasBlocker;
        }
        if (!hasType) return false;
        if (!hasBlocker) return true;
        // Vertex sits on a rock corner, but this cell does not hug the wall.
        // Ignore cardinal-only matches so dirt does not paint a vertical half-cell
        // of bleed parallel to the rock face.
        return hasTypeOnCell || hasTypeDiagonalToCell;
    };

    const tl = vertexInside(col, row) ? MARCHING_SQUARE_TL : 0;
    const tr = vertexInside(col + 1, row) ? MARCHING_SQUARE_TR : 0;
    const br = vertexInside(col + 1, row + 1) ? MARCHING_SQUARE_BR : 0;
    const bl = vertexInside(col, row + 1) ? MARCHING_SQUARE_BL : 0;
    return tl | tr | br | bl;
}

export class MarchingSquaresLayerRenderer extends TerrainLayerRenderer {
    override readonly blocksBleed = false;

    constructor(private readonly terrainType: TerrainType) {
        super();
    }

    /**
     * Draw all cells of this terrain type using marching squares.
     * Skips cells whose terrain type blocks bleed (e.g. hard-edge rock).
     */
    override drawLayer(
        ctx: CanvasRenderingContext2D,
        getTypeAt: (c: number, r: number) => TerrainType,
        width: number,
        height: number,
        cellSize: number,
    ): void {
        const cs = cellSize;
        const terrainType = this.terrainType;

        ctx.fillStyle = TERRAIN_PROPERTIES[terrainType].color;
        const isInBounds = (c: number, r: number): boolean => c >= 0 && r >= 0 && c < width && r < height;

        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                if (TERRAIN_PROPERTIES[getTypeAt(col, row)].blocksBleed) continue;
                const caseIdx = marchingSquareCase(col, row, terrainType, getTypeAt, isInBounds);
                if (caseIdx === MARCHING_SQUARE_NONE) continue;
                this.drawMarchingCase(ctx, col * cs, row * cs, cs, caseIdx);
            }
        }
    }

    /**
     * Repaint a single cell via marching squares.
     * Skips if this cell's terrain type blocks bleed.
     * Vertex values are computed from getTypeAt (OOB-safe — returns Rock by convention).
     */
    override drawCell(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        _cellSize: number,
        col: number,
        row: number,
        getTypeAt: (c: number, r: number) => TerrainType,
        gridWidth?: number,
        gridHeight?: number,
    ): void {
        if (TERRAIN_PROPERTIES[getTypeAt(col, row)].blocksBleed) return;

        const isInBounds = (c: number, r: number): boolean =>
            gridWidth === undefined || gridHeight === undefined
                ? true
                : c >= 0 && r >= 0 && c < gridWidth && r < gridHeight;
        const caseIdx = marchingSquareCase(col, row, this.terrainType, getTypeAt, isInBounds);
        if (caseIdx === MARCHING_SQUARE_NONE) return;

        ctx.fillStyle = TERRAIN_PROPERTIES[this.terrainType].color;
        this.drawMarchingCase(ctx, x, y, _cellSize, caseIdx);
    }

    /**
     * Draw the filled shape for a single marching squares case.
     * Cell origin is (x, y), size is s × s. Midpoints of edges are the interpolation points.
     */
    private drawMarchingCase(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        s: number,
        caseIdx: number,
    ): void {
        const h = s / 2;

        ctx.beginPath();

        switch (caseIdx) {
            case MARCHING_SQUARE_BL:
                ctx.moveTo(x, y + h);
                ctx.lineTo(x + h, y + s);
                ctx.lineTo(x, y + s);
                break;
            case MARCHING_SQUARE_BR:
                ctx.moveTo(x + h, y + s);
                ctx.lineTo(x + s, y + h);
                ctx.lineTo(x + s, y + s);
                break;
            case MARCHING_SQUARE_BOTTOM:
                ctx.moveTo(x, y + h);
                ctx.lineTo(x + s, y + h);
                ctx.lineTo(x + s, y + s);
                ctx.lineTo(x, y + s);
                break;
            case MARCHING_SQUARE_TR:
                ctx.moveTo(x + h, y);
                ctx.lineTo(x + s, y);
                ctx.lineTo(x + s, y + h);
                break;
            case MARCHING_SQUARE_TR | MARCHING_SQUARE_BL: // saddle — two triangles
                ctx.moveTo(x, y + h);
                ctx.lineTo(x + h, y + s);
                ctx.lineTo(x, y + s);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(x + h, y);
                ctx.lineTo(x + s, y);
                ctx.lineTo(x + s, y + h);
                break;
            case MARCHING_SQUARE_TR | MARCHING_SQUARE_BR:
                ctx.moveTo(x + h, y);
                ctx.lineTo(x + s, y);
                ctx.lineTo(x + s, y + s);
                ctx.lineTo(x + h, y + s);
                break;
            case MARCHING_SQUARE_TR | MARCHING_SQUARE_BOTTOM:
                ctx.moveTo(x, y + h);
                ctx.lineTo(x + h, y);
                ctx.lineTo(x + s, y);
                ctx.lineTo(x + s, y + s);
                ctx.lineTo(x, y + s);
                break;
            case MARCHING_SQUARE_TL:
                ctx.moveTo(x, y);
                ctx.lineTo(x + h, y);
                ctx.lineTo(x, y + h);
                break;
            case MARCHING_SQUARE_LEFT:
                ctx.moveTo(x, y);
                ctx.lineTo(x + h, y);
                ctx.lineTo(x + h, y + s);
                ctx.lineTo(x, y + s);
                break;
            case MARCHING_SQUARE_TL | MARCHING_SQUARE_BR: // saddle — two triangles
                ctx.moveTo(x, y);
                ctx.lineTo(x + h, y);
                ctx.lineTo(x, y + h);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(x + h, y + s);
                ctx.lineTo(x + s, y + h);
                ctx.lineTo(x + s, y + s);
                break;
            case MARCHING_SQUARE_LEFT | MARCHING_SQUARE_BR:
                ctx.moveTo(x, y);
                ctx.lineTo(x + h, y);
                ctx.lineTo(x + s, y + h);
                ctx.lineTo(x + s, y + s);
                ctx.lineTo(x, y + s);
                break;
            case MARCHING_SQUARE_TL | MARCHING_SQUARE_TR:
                ctx.moveTo(x, y);
                ctx.lineTo(x + s, y);
                ctx.lineTo(x + s, y + h);
                ctx.lineTo(x, y + h);
                break;
            case MARCHING_SQUARE_TL | MARCHING_SQUARE_TR | MARCHING_SQUARE_BL:
                ctx.moveTo(x, y);
                ctx.lineTo(x + s, y);
                ctx.lineTo(x + s, y + h);
                ctx.lineTo(x + h, y + s);
                ctx.lineTo(x, y + s);
                break;
            case MARCHING_SQUARE_TL | MARCHING_SQUARE_TR | MARCHING_SQUARE_BR:
                ctx.moveTo(x, y);
                ctx.lineTo(x + s, y);
                ctx.lineTo(x + s, y + s);
                ctx.lineTo(x + h, y + s);
                ctx.lineTo(x, y + h);
                break;
            case MARCHING_SQUARE_ALL:
                ctx.rect(x, y, s, s);
                break;
        }

        ctx.closePath();
        ctx.fill();
    }
}
