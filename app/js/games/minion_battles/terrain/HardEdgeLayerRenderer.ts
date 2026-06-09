import { TerrainLayerRenderer } from './TerrainLayerRenderer';
import { TerrainType, TERRAIN_PROPERTIES } from './TerrainType';

/** Neighbour terrain visible at rock edges (pixels). */
const ROCK_BLEED_PX = 2;
/** Corner chamfer size — diagonal cut simulates a rounded rock face. */
const ROCK_CHAMFER_PX = 4;
/** Dark outline on the inset rock core. */
const ROCK_BORDER_COLOR = '#4a4a4a';
const ROCK_BORDER_WIDTH = 1;

export class HardEdgeLayerRenderer extends TerrainLayerRenderer {
    override readonly blocksBleed = true;

    constructor(private readonly terrainType: TerrainType) {
        super();
    }

    /**
     * Two-pass draw over all cells of this terrain type.
     * Pass 1 draws all cell bases (solid fill + neighbour bleeds) before Pass 2 draws
     * all chamfers and borders — ensuring bleed strips are never painted over borders.
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

        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                if (getTypeAt(col, row) !== terrainType) continue;
                this.drawCellBase(ctx, col * cs, row * cs, cs, col, row, getTypeAt);
            }
        }
        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                if (getTypeAt(col, row) !== terrainType) continue;
                this.drawCellSurface(ctx, col * cs, row * cs, cs, col, row, getTypeAt);
            }
        }
    }

    /**
     * Repaint a single cell. No-op if the cell isn't this terrain type.
     * Calls both passes in sequence; safe within a clipped region.
     */
    override drawCell(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        cellSize: number,
        col: number,
        row: number,
        getTypeAt: (c: number, r: number) => TerrainType,
    ): void {
        if (getTypeAt(col, row) !== this.terrainType) return;
        this.drawCellBase(ctx, x, y, cellSize, col, row, getTypeAt);
        this.drawCellSurface(ctx, x, y, cellSize, col, row, getTypeAt);
    }

    /** Returns true if t should be treated as the same material (no bleed/chamfer/border at shared edge). */
    private isSameFamily(t: TerrainType): boolean {
        return t === this.terrainType || TERRAIN_PROPERTIES[this.terrainType].hardEdgeFamily.includes(t);
    }

    /** Pass 1 — solid base and neighbour bleed strips (drawn for all cells before chamfers). */
    private drawCellBase(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        size: number,
        col: number,
        row: number,
        getTypeAt: (c: number, r: number) => TerrainType,
    ): void {
        const rock = this.terrainType;
        const north = getTypeAt(col, row - 1);
        const south = getTypeAt(col, row + 1);
        const west = getTypeAt(col - 1, row);
        const east = getTypeAt(col + 1, row);
        const b = ROCK_BLEED_PX;
        const rockColor = TERRAIN_PROPERTIES[rock].color;

        ctx.fillStyle = rockColor;
        ctx.fillRect(x, y, size, size);

        if (!this.isSameFamily(north)) {
            ctx.fillStyle = TERRAIN_PROPERTIES[north].color;
            ctx.fillRect(x, y, size, b);
        }
        if (!this.isSameFamily(south)) {
            ctx.fillStyle = TERRAIN_PROPERTIES[south].color;
            ctx.fillRect(x, y + size - b, size, b);
        }
        if (!this.isSameFamily(west)) {
            ctx.fillStyle = TERRAIN_PROPERTIES[west].color;
            ctx.fillRect(x, y, b, size);
        }
        if (!this.isSameFamily(east)) {
            ctx.fillStyle = TERRAIN_PROPERTIES[east].color;
            ctx.fillRect(x + size - b, y, b, size);
        }

        if (!this.isSameFamily(north) && !this.isSameFamily(west) && north !== west) {
            this.fillSplitCorner(ctx, x, y, b, TERRAIN_PROPERTIES[west].color, TERRAIN_PROPERTIES[north].color);
        }
        if (!this.isSameFamily(north) && !this.isSameFamily(east) && north !== east) {
            this.fillSplitCorner(ctx, x + size - b, y, b, TERRAIN_PROPERTIES[north].color, TERRAIN_PROPERTIES[east].color);
        }
        if (!this.isSameFamily(south) && !this.isSameFamily(west) && south !== west) {
            this.fillSplitCorner(ctx, x, y + size - b, b, TERRAIN_PROPERTIES[west].color, TERRAIN_PROPERTIES[south].color);
        }
        if (!this.isSameFamily(south) && !this.isSameFamily(east) && south !== east) {
            this.fillSplitCorner(ctx, x + size - b, y + size - b, b, TERRAIN_PROPERTIES[south].color, TERRAIN_PROPERTIES[east].color);
        }
    }

    /** Pass 2 — chamfer underlays, inset core, wrap-corner fills, and border strokes. */
    private drawCellSurface(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        size: number,
        col: number,
        row: number,
        getTypeAt: (c: number, r: number) => TerrainType,
    ): void {
        const rock = this.terrainType;
        const north = getTypeAt(col, row - 1);
        const south = getTypeAt(col, row + 1);
        const west = getTypeAt(col - 1, row);
        const east = getTypeAt(col + 1, row);
        const northWest = getTypeAt(col - 1, row - 1);
        const northEast = getTypeAt(col + 1, row - 1);
        const southWest = getTypeAt(col - 1, row + 1);
        const southEast = getTypeAt(col + 1, row + 1);
        const b = ROCK_BLEED_PX;
        const rockColor = TERRAIN_PROPERTIES[rock].color;

        const coreX = x + (this.isSameFamily(west) ? 0 : b);
        const coreY = y + (this.isSameFamily(north) ? 0 : b);
        const coreW = size - (this.isSameFamily(west) ? 0 : b) - (this.isSameFamily(east) ? 0 : b);
        const coreH = size - (this.isSameFamily(north) ? 0 : b) - (this.isSameFamily(south) ? 0 : b);
        const allCardinalsRock = this.isSameFamily(north) && this.isSameFamily(south) && this.isSameFamily(west) && this.isSameFamily(east);
        const chamferW = allCardinalsRock ? size : coreW;
        const chamferH = allCardinalsRock ? size : coreH;
        const chamferX = allCardinalsRock ? x : coreX;
        const chamferY = allCardinalsRock ? y : coreY;

        const chamfer = this.computeChamfers(
            north, south, west, east,
            northWest, northEast, southWest, southEast,
            chamferW, chamferH,
        );

        this.fillChamferUnderlays(ctx, chamferX, chamferY, chamferW, chamferH, chamfer, northWest, northEast, southWest, southEast);

        ctx.fillStyle = rockColor;
        this.fillChamferedRect(ctx, chamferX, chamferY, chamferW, chamferH, chamfer);

        this.fillWrapCorners(ctx, x, y, size, rockColor, north, south, west, east, northWest, northEast, southWest, southEast);

        this.strokeBorders(ctx, x, y, size, chamferX, chamferY, chamferW, chamferH, chamfer, north, south, west, east, northWest, northEast, southWest, southEast);
    }

    /** Chamfer only exterior convex corners (both cardinals open). */
    private computeChamfers(
        north: TerrainType,
        south: TerrainType,
        west: TerrainType,
        east: TerrainType,
        _northWest: TerrainType,
        _northEast: TerrainType,
        _southWest: TerrainType,
        _southEast: TerrainType,
        coreW: number,
        coreH: number,
    ): { nw: number; ne: number; se: number; sw: number } {
        const maxCh = Math.max(1, Math.min(ROCK_CHAMFER_PX, Math.floor(Math.min(coreW, coreH) / 2)));
        const convex = (cardA: TerrainType, cardB: TerrainType): boolean =>
            !this.isSameFamily(cardA) && !this.isSameFamily(cardB);

        return {
            nw: convex(north, west) ? maxCh : 0,
            ne: convex(north, east) ? maxCh : 0,
            se: convex(south, east) ? maxCh : 0,
            sw: convex(south, west) ? maxCh : 0,
        };
    }

    private fillChamferedRect(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        w: number,
        h: number,
        ch: { nw: number; ne: number; se: number; sw: number },
    ): void {
        const { nw, ne, se, sw } = ch;
        ctx.beginPath();
        ctx.moveTo(x + nw, y);
        ctx.lineTo(x + w - ne, y);
        if (ne > 0) {
            ctx.lineTo(x + w, y + ne);
        } else {
            ctx.lineTo(x + w, y);
        }
        ctx.lineTo(x + w, y + h - se);
        if (se > 0) {
            ctx.lineTo(x + w - se, y + h);
        } else {
            ctx.lineTo(x + w, y + h);
        }
        ctx.lineTo(x + sw, y + h);
        if (sw > 0) {
            ctx.lineTo(x, y + h - sw);
        } else {
            ctx.lineTo(x, y + h);
        }
        ctx.lineTo(x, y + nw);
        if (nw > 0) {
            ctx.lineTo(x + nw, y);
        } else {
            ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
    }

    /**
     * Fill small rock-coloured triangles that bridge each active wrap-diagonal corner.
     * The wrap diagonal border line runs from the core edge into the bleed strip to the
     * tile corner, but the chamfered rect fill stops at the core edge. These triangles
     * close that gap so the fill and the border line share the same boundary.
     */
    private fillWrapCorners(
        ctx: CanvasRenderingContext2D,
        tileX: number,
        tileY: number,
        size: number,
        color: string,
        north: TerrainType,
        south: TerrainType,
        west: TerrainType,
        east: TerrainType,
        northWest: TerrainType,
        northEast: TerrainType,
        southWest: TerrainType,
        southEast: TerrainType,
    ): void {
        const rock = this.terrainType;
        const b = ROCK_BLEED_PX;
        const wrap = ROCK_CHAMFER_PX;
        ctx.fillStyle = color;

        // Top edge wraps (north bleed strip, b pixels tall)
        if (this.isSameFamily(west) && !this.isSameFamily(north) && this.isSameFamily(northWest)) {
            ctx.beginPath();
            ctx.moveTo(tileX, tileY);
            ctx.lineTo(tileX, tileY + b);
            ctx.lineTo(tileX + wrap, tileY + b);
            ctx.closePath();
            ctx.fill();
        }
        if (this.isSameFamily(east) && !this.isSameFamily(north) && this.isSameFamily(northEast)) {
            ctx.beginPath();
            ctx.moveTo(tileX + size, tileY);
            ctx.lineTo(tileX + size, tileY + b);
            ctx.lineTo(tileX + size - wrap, tileY + b);
            ctx.closePath();
            ctx.fill();
        }

        // Right edge wraps (east bleed strip, b pixels wide)
        if (this.isSameFamily(north) && !this.isSameFamily(east) && this.isSameFamily(northEast)) {
            ctx.beginPath();
            ctx.moveTo(tileX + size - b, tileY);
            ctx.lineTo(tileX + size, tileY);
            ctx.lineTo(tileX + size - b, tileY + wrap);
            ctx.closePath();
            ctx.fill();
        }
        if (this.isSameFamily(south) && !this.isSameFamily(east) && this.isSameFamily(southEast)) {
            ctx.beginPath();
            ctx.moveTo(tileX + size - b, tileY + size);
            ctx.lineTo(tileX + size, tileY + size);
            ctx.lineTo(tileX + size - b, tileY + size - wrap);
            ctx.closePath();
            ctx.fill();
        }

        // Bottom edge wraps (south bleed strip, b pixels tall)
        if (this.isSameFamily(east) && !this.isSameFamily(south) && this.isSameFamily(southEast)) {
            ctx.beginPath();
            ctx.moveTo(tileX + size, tileY + size);
            ctx.lineTo(tileX + size, tileY + size - b);
            ctx.lineTo(tileX + size - wrap, tileY + size - b);
            ctx.closePath();
            ctx.fill();
        }
        if (this.isSameFamily(west) && !this.isSameFamily(south) && this.isSameFamily(southWest)) {
            ctx.beginPath();
            ctx.moveTo(tileX, tileY + size);
            ctx.lineTo(tileX, tileY + size - b);
            ctx.lineTo(tileX + wrap, tileY + size - b);
            ctx.closePath();
            ctx.fill();
        }

        // Left edge wraps (west bleed strip, b pixels wide)
        if (this.isSameFamily(south) && !this.isSameFamily(west) && this.isSameFamily(southWest)) {
            ctx.beginPath();
            ctx.moveTo(tileX + b, tileY + size);
            ctx.lineTo(tileX, tileY + size);
            ctx.lineTo(tileX + b, tileY + size - wrap);
            ctx.closePath();
            ctx.fill();
        }
        if (this.isSameFamily(north) && !this.isSameFamily(west) && this.isSameFamily(northWest)) {
            ctx.beginPath();
            ctx.moveTo(tileX + b, tileY);
            ctx.lineTo(tileX, tileY);
            ctx.lineTo(tileX + b, tileY + wrap);
            ctx.closePath();
            ctx.fill();
        }
    }

    /**
     * Outline open cardinal edges, convex chamfer diagonals, and wrap diagonals that
     * extend a border to the tile vertex when hugging an interior rock neighbour.
     */
    private strokeBorders(
        ctx: CanvasRenderingContext2D,
        tileX: number,
        tileY: number,
        tileSize: number,
        x: number,
        y: number,
        w: number,
        h: number,
        ch: { nw: number; ne: number; se: number; sw: number },
        north: TerrainType,
        south: TerrainType,
        west: TerrainType,
        east: TerrainType,
        northWest: TerrainType,
        northEast: TerrainType,
        southWest: TerrainType,
        southEast: TerrainType,
    ): void {
        const { nw, ne, se, sw } = ch;
        const wrap = ROCK_CHAMFER_PX;
        ctx.strokeStyle = ROCK_BORDER_COLOR;
        ctx.lineWidth = ROCK_BORDER_WIDTH;
        ctx.beginPath();

        const left = x + 0.5;
        const top = y + 0.5;
        const right = x + w - 0.5;
        const bottom = y + h - 0.5;
        const tileLeft = tileX + 0.5;
        const tileTop = tileY + 0.5;
        const tileRight = tileX + tileSize - 0.5;
        const tileBottom = tileY + tileSize - 0.5;

        const topWrapNw = this.isSameFamily(west) && !this.isSameFamily(north) && this.isSameFamily(northWest);
        const topWrapNe = this.isSameFamily(east) && !this.isSameFamily(north) && this.isSameFamily(northEast);
        const rightWrapNe = this.isSameFamily(north) && !this.isSameFamily(east) && this.isSameFamily(northEast);
        const rightWrapSe = this.isSameFamily(south) && !this.isSameFamily(east) && this.isSameFamily(southEast);
        const bottomWrapSe = this.isSameFamily(east) && !this.isSameFamily(south) && this.isSameFamily(southEast);
        const bottomWrapSw = this.isSameFamily(west) && !this.isSameFamily(south) && this.isSameFamily(southWest);
        const leftWrapSw = this.isSameFamily(south) && !this.isSameFamily(west) && this.isSameFamily(southWest);
        const leftWrapNw = this.isSameFamily(north) && !this.isSameFamily(west) && this.isSameFamily(northWest);

        if (!this.isSameFamily(north)) {
            const startX = topWrapNw ? tileX + wrap + 0.5 : (nw > 0 ? left + nw : left);
            const endX = topWrapNe ? tileRight - wrap : (ne > 0 ? right - ne : right);
            ctx.moveTo(startX, top);
            ctx.lineTo(endX, top);
        }
        if (!this.isSameFamily(east)) {
            const startY = rightWrapNe ? tileY + wrap + 0.5 : (ne > 0 ? top + ne : top);
            const endY = rightWrapSe ? tileBottom - wrap : (se > 0 ? bottom - se : bottom);
            ctx.moveTo(right, startY);
            ctx.lineTo(right, endY);
        }
        if (!this.isSameFamily(south)) {
            const startX = bottomWrapSe ? tileRight - wrap : (se > 0 ? right - se : right);
            const endX = bottomWrapSw ? tileX + wrap + 0.5 : (sw > 0 ? left + sw : left);
            ctx.moveTo(startX, bottom);
            ctx.lineTo(endX, bottom);
        }
        if (!this.isSameFamily(west)) {
            const startY = leftWrapSw ? tileBottom - wrap : (sw > 0 ? bottom - sw : bottom);
            const endY = leftWrapNw ? tileY + wrap + 0.5 : (nw > 0 ? top + nw : top);
            ctx.moveTo(left, startY);
            ctx.lineTo(left, endY);
        }

        if (topWrapNw) {
            ctx.moveTo(tileX + wrap + 0.5, top);
            ctx.lineTo(tileLeft, tileTop);
        }
        if (topWrapNe) {
            ctx.moveTo(tileRight - wrap, top);
            ctx.lineTo(tileRight, tileTop);
        }
        if (rightWrapNe) {
            ctx.moveTo(right, tileY + wrap + 0.5);
            ctx.lineTo(tileRight, tileTop);
        }
        if (rightWrapSe) {
            ctx.moveTo(right, tileBottom - wrap);
            ctx.lineTo(tileRight, tileBottom);
        }
        if (bottomWrapSe) {
            ctx.moveTo(tileRight - wrap, bottom);
            ctx.lineTo(tileRight, tileBottom);
        }
        if (bottomWrapSw) {
            ctx.moveTo(tileX + wrap + 0.5, bottom);
            ctx.lineTo(tileLeft, tileBottom);
        }
        if (leftWrapSw) {
            ctx.moveTo(left, tileBottom - wrap);
            ctx.lineTo(tileLeft, tileBottom);
        }
        if (leftWrapNw) {
            ctx.moveTo(left, tileY + wrap + 0.5);
            ctx.lineTo(tileLeft, tileTop);
        }

        if (nw > 0) {
            ctx.moveTo(left + nw, top);
            ctx.lineTo(left, top + nw);
        }
        if (ne > 0) {
            ctx.moveTo(right - ne, top);
            ctx.lineTo(right, top + ne);
        }
        if (se > 0) {
            ctx.moveTo(right, bottom - se);
            ctx.lineTo(right - se, bottom);
        }
        if (sw > 0) {
            ctx.moveTo(left + sw, bottom);
            ctx.lineTo(left, bottom - sw);
        }

        ctx.stroke();
    }

    /** Paint each chamfer cut-out with the diagonal neighbour colour. */
    private fillChamferUnderlays(
        ctx: CanvasRenderingContext2D,
        coreX: number,
        coreY: number,
        coreW: number,
        coreH: number,
        ch: { nw: number; ne: number; se: number; sw: number },
        northWest: TerrainType,
        northEast: TerrainType,
        southWest: TerrainType,
        southEast: TerrainType,
    ): void {
        if (ch.nw > 0) this.fillCornerTriangle(ctx, coreX, coreY, ch.nw, TERRAIN_PROPERTIES[northWest].color, 'nw');
        if (ch.ne > 0) this.fillCornerTriangle(ctx, coreX, coreY, ch.ne, TERRAIN_PROPERTIES[northEast].color, 'ne', coreW);
        if (ch.se > 0) this.fillCornerTriangle(ctx, coreX, coreY, ch.se, TERRAIN_PROPERTIES[southEast].color, 'se', coreW, coreH);
        if (ch.sw > 0) this.fillCornerTriangle(ctx, coreX, coreY, ch.sw, TERRAIN_PROPERTIES[southWest].color, 'sw', undefined, coreH);
    }

    private fillCornerTriangle(
        ctx: CanvasRenderingContext2D,
        coreX: number,
        coreY: number,
        size: number,
        color: string,
        corner: 'nw' | 'ne' | 'se' | 'sw',
        coreW?: number,
        coreH?: number,
    ): void {
        ctx.fillStyle = color;
        ctx.beginPath();
        switch (corner) {
            case 'nw':
                ctx.moveTo(coreX, coreY);
                ctx.lineTo(coreX + size, coreY);
                ctx.lineTo(coreX, coreY + size);
                break;
            case 'ne': {
                const right = coreX + (coreW ?? 0);
                ctx.moveTo(right, coreY);
                ctx.lineTo(right - size, coreY);
                ctx.lineTo(right, coreY + size);
                break;
            }
            case 'se': {
                const right = coreX + (coreW ?? 0);
                const bottom = coreY + (coreH ?? 0);
                ctx.moveTo(right, bottom);
                ctx.lineTo(right - size, bottom);
                ctx.lineTo(right, bottom - size);
                break;
            }
            case 'sw': {
                const bottom = coreY + (coreH ?? 0);
                ctx.moveTo(coreX, bottom);
                ctx.lineTo(coreX + size, bottom);
                ctx.lineTo(coreX, bottom - size);
                break;
            }
        }
        ctx.closePath();
        ctx.fill();
    }

    /**
     * Fill a corner bleed square with two triangles when neighbours differ.
     * Upper-left triangle = colorA, lower-right triangle = colorB.
     */
    private fillSplitCorner(
        ctx: CanvasRenderingContext2D,
        cx: number,
        cy: number,
        b: number,
        colorA: string,
        colorB: string,
    ): void {
        ctx.fillStyle = colorA;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + b, cy);
        ctx.lineTo(cx, cy + b);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = colorB;
        ctx.beginPath();
        ctx.moveTo(cx + b, cy);
        ctx.lineTo(cx + b, cy + b);
        ctx.lineTo(cx, cy + b);
        ctx.closePath();
        ctx.fill();
    }
}
