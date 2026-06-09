/**
 * TerrainRenderer - Renders terrain using marching squares to a cached PixiJS Sprite.
 *
 * Draws terrain layers (dirt base, then grass, dirt again above grass, thick grass, rubble) using a
 * marching squares algorithm for smooth terrain boundary transitions. Rock uses a separate
 * hard-edged tile renderer (no marching-squares bleed). The result is rendered to an offscreen
 * result is rendered to an offscreen canvas and converted to a PixiJS Sprite
 * that is added to the game scene once and never redrawn.
 *
 * Dynamic updates: call `invalidateTile(col, row)` when a floor tile changes, then
 * `update(tm)` each frame to repaint dirty cells using effective terrain (floor + bedrock).
 */

import { Sprite, Texture } from 'pixi.js';
import { TerrainGrid } from './TerrainGrid';
import { TerrainType, TERRAIN_PROPERTIES } from './TerrainType';
import type { TerrainManager } from './TerrainManager';

/**
 * Render order: layers are drawn bottom to top so higher-priority
 * terrain types paint over lower ones.
 */
/** Rock last so grass/thick grass edges do not paint over stone (clearer blocked tiles). */
const LAYER_ORDER: TerrainType[] = [
    TerrainType.Grass,
    TerrainType.ThickGrass,
    TerrainType.Dirt,
    TerrainType.Rubble,
    TerrainType.Rock,
];

/** Neighbour terrain visible at rock edges (pixels). */
const ROCK_BLEED_PX = 2;
/** Corner chamfer size — diagonal cut simulates a rounded rock face. */
const ROCK_CHAMFER_PX = 4;
/** Dark outline on the inset rock core. */
const ROCK_BORDER_COLOR = '#4a4a4a';
const ROCK_BORDER_WIDTH = 1;

function cellKey(col: number, row: number): string {
    return `${col},${row}`;
}

export class TerrainRenderer {
    private cachedSprite: Sprite | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private gridWidth: number = 0;
    private gridHeight: number = 0;
    private cellSize: number = 0;
    private dirtyTiles: Set<string> = new Set();

    /**
     * Build the terrain sprite. Call once when the battle starts.
     * Returns a PixiJS Sprite that should be added at the bottom of the scene.
     */
    buildSprite(grid: TerrainGrid): Sprite {
        if (this.cachedSprite) return this.cachedSprite;

        const worldW = grid.width * grid.cellSize;
        const worldH = grid.height * grid.cellSize;

        // Draw to an offscreen canvas
        const canvas = document.createElement('canvas');
        canvas.width = worldW;
        canvas.height = worldH;
        const ctx = canvas.getContext('2d')!;

        // Base layer: fill with dirt
        ctx.fillStyle = TERRAIN_PROPERTIES[TerrainType.Dirt].color;
        ctx.fillRect(0, 0, worldW, worldH);

        // Draw each terrain type layer using marching squares
        for (const terrainType of LAYER_ORDER) {
            this.drawTerrainLayer(ctx, grid, terrainType);
        }

        // Add subtle grid overlay
        this.drawGridOverlay(ctx, grid.cellSize, grid.width, grid.height);

        // Add noise texture for visual interest
        this.drawNoiseOverlay(ctx, 0, 0, worldW, worldH);

        // Convert canvas to PixiJS Sprite
        const texture = Texture.from({ resource: canvas, label: 'terrain' });
        const sprite = new Sprite(texture);
        sprite.x = 0;
        sprite.y = 0;
        sprite.label = 'terrain';

        this.cachedSprite = sprite;
        this.canvas = canvas;
        this.ctx = ctx;
        this.gridWidth = grid.width;
        this.gridHeight = grid.height;
        this.cellSize = grid.cellSize;
        return sprite;
    }

    /**
     * Mark a tile and its 3×3 neighbourhood as needing a redraw.
     * Call when a floor tile changes effective terrain (e.g. rock → rubble).
     */
    invalidateTile(col: number, row: number): void {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nc = col + dc;
                const nr = row + dr;
                if (nc >= 0 && nc < this.gridWidth && nr >= 0 && nr < this.gridHeight) {
                    this.dirtyTiles.add(cellKey(nc, nr));
                }
            }
        }
    }

    /**
     * Repaint all dirty tiles using effective terrain from the TerrainManager.
     * Call once per render frame after the engine has ticked.
     */
    update(tm: TerrainManager): void {
        if (this.dirtyTiles.size === 0 || !this.canvas || !this.ctx || !this.cachedSprite) return;

        for (const key of this.dirtyTiles) {
            const [col, row] = key.split(',').map(Number);
            this.repaintCell(this.ctx, tm, col, row);
        }
        this.dirtyTiles.clear();

        // Push canvas changes to the GPU.
        this.cachedSprite.texture.source.update();
    }

    /**
     * Repaint a single cell using effective terrain, applying the same
     * post-processing (grid lines, noise) as the initial full-canvas build.
     * A clip region restricts all drawing to the cell's exact pixel bounds so
     * shared boundary lines between neighbouring repainted cells don't double up.
     */
    private repaintCell(
        ctx: CanvasRenderingContext2D,
        tm: TerrainManager,
        col: number,
        row: number,
    ): void {
        const cs = this.cellSize;
        const x = col * cs;
        const y = row * cs;

        // Clip all drawing to this cell's bounds.
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, cs, cs);
        ctx.clip();

        // Erase and restore dirt base for this cell.
        ctx.clearRect(x, y, cs, cs);
        ctx.fillStyle = TERRAIN_PROPERTIES[TerrainType.Dirt].color;
        ctx.fillRect(x, y, cs, cs);

        // Redraw each terrain layer using effective terrain from the full 3×3 neighbourhood.
        for (const terrainType of LAYER_ORDER) {
            if (terrainType === TerrainType.Rock) {
                if (tm.getEffectiveTerrainType(col, row) === TerrainType.Rock) {
                    this.drawRockCell(
                        ctx,
                        x,
                        y,
                        cs,
                        col,
                        row,
                        (c, r) => tm.getEffectiveTerrainType(c, r),
                    );
                }
                continue;
            }

            // Other terrain must not bleed into rock cells.
            if (tm.getEffectiveTerrainType(col, row) === TerrainType.Rock) continue;

            // Compute the 4 corner vertex values for this cell.
            const tl = this.effectiveVertex(tm, col,     row,     terrainType) ? 1 : 0;
            const tr = this.effectiveVertex(tm, col + 1, row,     terrainType) ? 1 : 0;
            const br = this.effectiveVertex(tm, col + 1, row + 1, terrainType) ? 1 : 0;
            const bl = this.effectiveVertex(tm, col,     row + 1, terrainType) ? 1 : 0;

            const caseIdx = (tl << 3) | (tr << 2) | (br << 1) | bl;
            if (caseIdx === 0) continue;

            ctx.fillStyle = TERRAIN_PROPERTIES[terrainType].color;
            this.drawMarchingCase(ctx, x, y, cs, caseIdx);
        }

        // Reapply grid overlay clipped to this cell — same post-processing as buildSprite.
        this.drawGridOverlayCell(ctx, col, row, cs);

        ctx.restore();

        // Noise is applied via getImageData/putImageData which ignore clip; apply after restore.
        this.drawNoiseOverlay(ctx, x, y, cs, cs);
    }

    /**
     * Returns true if vertex (vx, vy) is "inside" for the given terrain type,
     * based on effective terrain (floor overrides + bedrock) for the up-to-4 cells
     * that share this vertex as a corner.
     */
    private effectiveVertex(
        tm: TerrainManager,
        vx: number,
        vy: number,
        terrainType: TerrainType,
    ): boolean {
        const { width: W, height: H } = tm.getGridSize();
        for (let dy = -1; dy <= 0; dy++) {
            for (let dx = -1; dx <= 0; dx++) {
                const cx = vx + dx;
                const cy = vy + dy;
                if (cx >= 0 && cx < W && cy >= 0 && cy < H) {
                    if (tm.getEffectiveTerrainType(cx, cy) === terrainType) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /**
     * Draw a single terrain type layer using marching squares.
     *
     * For each terrain type, we build a vertex field where each vertex
     * (at grid intersection points) is 1 if any adjacent cell is the
     * target type, 0 otherwise. Then marching squares determines the
     * fill shape per cell for smooth boundaries.
     */
    private drawTerrainLayer(
        ctx: CanvasRenderingContext2D,
        grid: TerrainGrid,
        terrainType: TerrainType,
    ): void {
        if (terrainType === TerrainType.Rock) {
            this.drawRockLayer(ctx, grid);
            return;
        }

        const cs = grid.cellSize;
        const W = grid.width;
        const H = grid.height;

        // Build vertex field: (W+1) × (H+1)
        // Vertex (vx, vy) sits at the corner shared by up to 4 cells
        const vW = W + 1;
        const vH = H + 1;
        const field = new Uint8Array(vW * vH);

        for (let vy = 0; vy < vH; vy++) {
            for (let vx = 0; vx < vW; vx++) {
                // A vertex is "inside" if any of its 4 neighboring cells is the target type
                let inside = false;
                for (let dy = -1; dy <= 0; dy++) {
                    for (let dx = -1; dx <= 0; dx++) {
                        const cx = vx + dx;
                        const cy = vy + dy;
                        if (cx >= 0 && cx < W && cy >= 0 && cy < H) {
                            if (grid.get(cx, cy) === terrainType) {
                                inside = true;
                            }
                        }
                    }
                }
                field[vy * vW + vx] = inside ? 1 : 0;
            }
        }

        // Marching squares: process each cell
        ctx.fillStyle = TERRAIN_PROPERTIES[terrainType].color;

        for (let cy = 0; cy < H; cy++) {
            for (let cx = 0; cx < W; cx++) {
                // Soft terrain must not bleed into bedrock rock cells.
                if (grid.get(cx, cy) === TerrainType.Rock) continue;

                const tl = field[cy * vW + cx];
                const tr = field[cy * vW + (cx + 1)];
                const br = field[(cy + 1) * vW + (cx + 1)];
                const bl = field[(cy + 1) * vW + cx];

                // 4-bit case index: TL=8, TR=4, BR=2, BL=1
                const caseIdx = (tl << 3) | (tr << 2) | (br << 1) | bl;
                if (caseIdx === 0) continue;

                this.drawMarchingCase(ctx, cx * cs, cy * cs, cs, caseIdx);
            }
        }
    }

    /**
     * Draw the filled shape for a single marching squares case.
     * Cell origin is (x, y), size is s × s.
     * Midpoints of edges are the interpolation points.
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
            case 1: // BL
                ctx.moveTo(x, y + h);
                ctx.lineTo(x + h, y + s);
                ctx.lineTo(x, y + s);
                break;
            case 2: // BR
                ctx.moveTo(x + h, y + s);
                ctx.lineTo(x + s, y + h);
                ctx.lineTo(x + s, y + s);
                break;
            case 3: // BL + BR
                ctx.moveTo(x, y + h);
                ctx.lineTo(x + s, y + h);
                ctx.lineTo(x + s, y + s);
                ctx.lineTo(x, y + s);
                break;
            case 4: // TR
                ctx.moveTo(x + h, y);
                ctx.lineTo(x + s, y);
                ctx.lineTo(x + s, y + h);
                break;
            case 5: // TR + BL (saddle — draw as two separate triangles)
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
            case 6: // TR + BR
                ctx.moveTo(x + h, y);
                ctx.lineTo(x + s, y);
                ctx.lineTo(x + s, y + s);
                ctx.lineTo(x + h, y + s);
                break;
            case 7: // TR + BR + BL
                ctx.moveTo(x, y + h);
                ctx.lineTo(x + h, y);
                ctx.lineTo(x + s, y);
                ctx.lineTo(x + s, y + s);
                ctx.lineTo(x, y + s);
                break;
            case 8: // TL
                ctx.moveTo(x, y);
                ctx.lineTo(x + h, y);
                ctx.lineTo(x, y + h);
                break;
            case 9: // TL + BL
                ctx.moveTo(x, y);
                ctx.lineTo(x + h, y);
                ctx.lineTo(x + h, y + s);
                ctx.lineTo(x, y + s);
                break;
            case 10: // TL + BR (saddle — two separate triangles)
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
            case 11: // TL + BL + BR
                ctx.moveTo(x, y);
                ctx.lineTo(x + h, y);
                ctx.lineTo(x + s, y + h);
                ctx.lineTo(x + s, y + s);
                ctx.lineTo(x, y + s);
                break;
            case 12: // TL + TR
                ctx.moveTo(x, y);
                ctx.lineTo(x + s, y);
                ctx.lineTo(x + s, y + h);
                ctx.lineTo(x, y + h);
                break;
            case 13: // TL + TR + BL
                ctx.moveTo(x, y);
                ctx.lineTo(x + s, y);
                ctx.lineTo(x + s, y + h);
                ctx.lineTo(x + h, y + s);
                ctx.lineTo(x, y + s);
                break;
            case 14: // TL + TR + BR
                ctx.moveTo(x, y);
                ctx.lineTo(x + s, y);
                ctx.lineTo(x + s, y + s);
                ctx.lineTo(x + h, y + s);
                ctx.lineTo(x, y + h);
                break;
            case 15: // All corners
                ctx.rect(x, y, s, s);
                break;
        }

        ctx.closePath();
        ctx.fill();
    }

    /** Draw all bedrock rock cells with hard edges and optional neighbour bleed strips. */
    private drawRockLayer(ctx: CanvasRenderingContext2D, grid: TerrainGrid): void {
        const cs = grid.cellSize;
        const getTypeAt = (c: number, r: number) => grid.get(c, r);
        for (let row = 0; row < grid.height; row++) {
            for (let col = 0; col < grid.width; col++) {
                if (grid.get(col, row) !== TerrainType.Rock) continue;
                this.drawRockCellBase(
                    ctx,
                    col * cs,
                    row * cs,
                    cs,
                    col,
                    row,
                    getTypeAt,
                );
            }
        }
        for (let row = 0; row < grid.height; row++) {
            for (let col = 0; col < grid.width; col++) {
                if (grid.get(col, row) !== TerrainType.Rock) continue;
                this.drawRockCellSurface(
                    ctx,
                    col * cs,
                    row * cs,
                    cs,
                    col,
                    row,
                    getTypeAt,
                );
            }
        }
    }

    /**
     * Rock occupies nearly the full cell with a thin neighbour-colour bleed at edges.
     * Rock never uses marching squares (no outward bleed); other layers skip rock cells.
     */
    private drawRockCell(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        size: number,
        col: number,
        row: number,
        getTypeAt: (c: number, r: number) => TerrainType,
    ): void {
        this.drawRockCellBase(ctx, x, y, size, col, row, getTypeAt);
        this.drawRockCellSurface(ctx, x, y, size, col, row, getTypeAt);
    }

    /** Pass 1 — solid base and neighbour bleed (all cells before chamfers). */
    private drawRockCellBase(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        size: number,
        col: number,
        row: number,
        getTypeAt: (c: number, r: number) => TerrainType,
    ): void {
        const rock = TerrainType.Rock;
        const north = getTypeAt(col, row - 1);
        const south = getTypeAt(col, row + 1);
        const west = getTypeAt(col - 1, row);
        const east = getTypeAt(col + 1, row);
        const b = ROCK_BLEED_PX;
        const rockColor = TERRAIN_PROPERTIES[rock].color;

        // Solid rock base — always visible; nothing bleeds over this from other layers.
        ctx.fillStyle = rockColor;
        ctx.fillRect(x, y, size, size);

        // Thin neighbour bleed strips on non-rock sides.
        if (north !== rock) {
            ctx.fillStyle = TERRAIN_PROPERTIES[north].color;
            ctx.fillRect(x, y, size, b);
        }
        if (south !== rock) {
            ctx.fillStyle = TERRAIN_PROPERTIES[south].color;
            ctx.fillRect(x, y + size - b, size, b);
        }
        if (west !== rock) {
            ctx.fillStyle = TERRAIN_PROPERTIES[west].color;
            ctx.fillRect(x, y, b, size);
        }
        if (east !== rock) {
            ctx.fillStyle = TERRAIN_PROPERTIES[east].color;
            ctx.fillRect(x + size - b, y, b, size);
        }

        // Corner splits when two adjacent non-rock neighbours differ in type.
        if (north !== rock && west !== rock && north !== west) {
            this.fillSplitCorner(ctx, x, y, b, TERRAIN_PROPERTIES[west].color, TERRAIN_PROPERTIES[north].color);
        }
        if (north !== rock && east !== rock && north !== east) {
            this.fillSplitCorner(ctx, x + size - b, y, b, TERRAIN_PROPERTIES[north].color, TERRAIN_PROPERTIES[east].color);
        }
        if (south !== rock && west !== rock && south !== west) {
            this.fillSplitCorner(ctx, x, y + size - b, b, TERRAIN_PROPERTIES[west].color, TERRAIN_PROPERTIES[south].color);
        }
        if (south !== rock && east !== rock && south !== east) {
            this.fillSplitCorner(ctx, x + size - b, y + size - b, b, TERRAIN_PROPERTIES[south].color, TERRAIN_PROPERTIES[east].color);
        }
    }

    /** Pass 2 — chamfer underlays, inset core, and borders (after every cell has its base). */
    private drawRockCellSurface(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        size: number,
        col: number,
        row: number,
        getTypeAt: (c: number, r: number) => TerrainType,
    ): void {
        const rock = TerrainType.Rock;
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

        const coreX = x + (west === rock ? 0 : b);
        const coreY = y + (north === rock ? 0 : b);
        const coreW = size - (west === rock ? 0 : b) - (east === rock ? 0 : b);
        const coreH = size - (north === rock ? 0 : b) - (south === rock ? 0 : b);
        const allCardinalsRock = north === rock && south === rock && west === rock && east === rock;
        const chamferW = allCardinalsRock ? size : coreW;
        const chamferH = allCardinalsRock ? size : coreH;
        const chamferX = allCardinalsRock ? x : coreX;
        const chamferY = allCardinalsRock ? y : coreY;

        const chamfer = this.computeRockChamfers(
            rock,
            north,
            south,
            west,
            east,
            northWest,
            northEast,
            southWest,
            southEast,
            chamferW,
            chamferH,
        );

        this.fillChamferUnderlays(
            ctx,
            chamferX,
            chamferY,
            chamferW,
            chamferH,
            chamfer,
            northWest,
            northEast,
            southWest,
            southEast,
        );

        ctx.fillStyle = rockColor;
        this.fillChamferedRect(ctx, chamferX, chamferY, chamferW, chamferH, chamfer);

        this.fillWrapCorners(
            ctx, x, y, size, rockColor,
            north, south, west, east,
            northWest, northEast, southWest, southEast,
        );

        this.strokeChamferedRockBorders(
            ctx,
            x,
            y,
            size,
            chamferX,
            chamferY,
            chamferW,
            chamferH,
            chamfer,
            north,
            south,
            west,
            east,
            northWest,
            northEast,
            southWest,
            southEast,
            rock,
        );
    }

    /**
     * Chamfer only exterior convex corners (two open cardinals).
     * Inner mass corners are handled by border-wrap diagonals on neighbour tiles.
     */
    private computeRockChamfers(
        rock: TerrainType,
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
            cardA !== rock && cardB !== rock;

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
        const rock = TerrainType.Rock;
        const b = ROCK_BLEED_PX;
        const wrap = ROCK_CHAMFER_PX;
        ctx.fillStyle = color;

        // Top edge wraps (north bleed strip, b pixels tall)
        if (west === rock && north !== rock && northWest === rock) {
            ctx.beginPath();
            ctx.moveTo(tileX, tileY);
            ctx.lineTo(tileX, tileY + b);
            ctx.lineTo(tileX + wrap, tileY + b);
            ctx.closePath();
            ctx.fill();
        }
        if (east === rock && north !== rock && northEast === rock) {
            ctx.beginPath();
            ctx.moveTo(tileX + size, tileY);
            ctx.lineTo(tileX + size, tileY + b);
            ctx.lineTo(tileX + size - wrap, tileY + b);
            ctx.closePath();
            ctx.fill();
        }

        // Right edge wraps (east bleed strip, b pixels wide)
        if (north === rock && east !== rock && northEast === rock) {
            ctx.beginPath();
            ctx.moveTo(tileX + size - b, tileY);
            ctx.lineTo(tileX + size, tileY);
            ctx.lineTo(tileX + size - b, tileY + wrap);
            ctx.closePath();
            ctx.fill();
        }
        if (south === rock && east !== rock && southEast === rock) {
            ctx.beginPath();
            ctx.moveTo(tileX + size - b, tileY + size);
            ctx.lineTo(tileX + size, tileY + size);
            ctx.lineTo(tileX + size - b, tileY + size - wrap);
            ctx.closePath();
            ctx.fill();
        }

        // Bottom edge wraps (south bleed strip, b pixels tall)
        if (east === rock && south !== rock && southEast === rock) {
            ctx.beginPath();
            ctx.moveTo(tileX + size, tileY + size);
            ctx.lineTo(tileX + size, tileY + size - b);
            ctx.lineTo(tileX + size - wrap, tileY + size - b);
            ctx.closePath();
            ctx.fill();
        }
        if (west === rock && south !== rock && southWest === rock) {
            ctx.beginPath();
            ctx.moveTo(tileX, tileY + size);
            ctx.lineTo(tileX, tileY + size - b);
            ctx.lineTo(tileX + wrap, tileY + size - b);
            ctx.closePath();
            ctx.fill();
        }

        // Left edge wraps (west bleed strip, b pixels wide)
        if (south === rock && west !== rock && southWest === rock) {
            ctx.beginPath();
            ctx.moveTo(tileX + b, tileY + size);
            ctx.lineTo(tileX, tileY + size);
            ctx.lineTo(tileX + b, tileY + size - wrap);
            ctx.closePath();
            ctx.fill();
        }
        if (north === rock && west !== rock && northWest === rock) {
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
    private strokeChamferedRockBorders(
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
        rock: TerrainType,
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

        // A wrap diagonal only makes sense at a genuine concave inner corner: the two
        // cardinal neighbours are rock AND the shared diagonal neighbour is also rock.
        const topWrapNw = west === rock && north !== rock && northWest === rock;
        const topWrapNe = east === rock && north !== rock && northEast === rock;
        const rightWrapNe = north === rock && east !== rock && northEast === rock;
        const rightWrapSe = south === rock && east !== rock && southEast === rock;
        const bottomWrapSe = east === rock && south !== rock && southEast === rock;
        const bottomWrapSw = west === rock && south !== rock && southWest === rock;
        const leftWrapSw = south === rock && west !== rock && southWest === rock;
        const leftWrapNw = north === rock && west !== rock && northWest === rock;

        if (north !== rock) {
            const startX = topWrapNw ? tileX + wrap + 0.5 : (nw > 0 ? left + nw : left);
            const endX = topWrapNe ? tileRight - wrap : (ne > 0 ? right - ne : right);
            ctx.moveTo(startX, top);
            ctx.lineTo(endX, top);
        }
        if (east !== rock) {
            const startY = rightWrapNe ? tileY + wrap + 0.5 : (ne > 0 ? top + ne : top);
            const endY = rightWrapSe ? tileBottom - wrap : (se > 0 ? bottom - se : bottom);
            ctx.moveTo(right, startY);
            ctx.lineTo(right, endY);
        }
        if (south !== rock) {
            const startX = bottomWrapSe ? tileRight - wrap : (se > 0 ? right - se : right);
            const endX = bottomWrapSw ? tileX + wrap + 0.5 : (sw > 0 ? left + sw : left);
            ctx.moveTo(startX, bottom);
            ctx.lineTo(endX, bottom);
        }
        if (west !== rock) {
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

    /** Paint every chamfer cut-out with the diagonal neighbour colour (grass at outer corners too). */
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
        if (ch.nw > 0) {
            this.fillCornerTriangle(ctx, coreX, coreY, ch.nw, TERRAIN_PROPERTIES[northWest].color, 'nw');
        }
        if (ch.ne > 0) {
            this.fillCornerTriangle(
                ctx,
                coreX,
                coreY,
                ch.ne,
                TERRAIN_PROPERTIES[northEast].color,
                'ne',
                coreW,
            );
        }
        if (ch.se > 0) {
            this.fillCornerTriangle(
                ctx,
                coreX,
                coreY,
                ch.se,
                TERRAIN_PROPERTIES[southEast].color,
                'se',
                coreW,
                coreH,
            );
        }
        if (ch.sw > 0) {
            this.fillCornerTriangle(
                ctx,
                coreX,
                coreY,
                ch.sw,
                TERRAIN_PROPERTIES[southWest].color,
                'sw',
                undefined,
                coreH,
            );
        }
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

    /** Subtle grid lines across the full canvas. */
    private drawGridOverlay(
        ctx: CanvasRenderingContext2D,
        cs: number,
        gridWidth: number,
        gridHeight: number,
    ): void {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.lineWidth = 1;

        for (let c = 1; c < gridWidth; c++) {
            ctx.beginPath();
            ctx.moveTo(c * cs, 0);
            ctx.lineTo(c * cs, gridHeight * cs);
            ctx.stroke();
        }

        for (let r = 1; r < gridHeight; r++) {
            ctx.beginPath();
            ctx.moveTo(0, r * cs);
            ctx.lineTo(gridWidth * cs, r * cs);
            ctx.stroke();
        }
    }

    /** Redraws the grid line segments that pass through or border a single cell. */
    private drawGridOverlayCell(
        ctx: CanvasRenderingContext2D,
        col: number,
        row: number,
        cs: number,
    ): void {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.lineWidth = 1;

        const x = col * cs;
        const y = row * cs;

        // Vertical lines at the cell's left and right boundaries (interior lines only).
        if (col > 0) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + cs);
            ctx.stroke();
        }
        if (col + 1 < this.gridWidth) {
            ctx.beginPath();
            ctx.moveTo(x + cs, y);
            ctx.lineTo(x + cs, y + cs);
            ctx.stroke();
        }

        // Horizontal lines at the cell's top and bottom boundaries (interior lines only).
        if (row > 0) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + cs, y);
            ctx.stroke();
        }
        if (row + 1 < this.gridHeight) {
            ctx.beginPath();
            ctx.moveTo(x, y + cs);
            ctx.lineTo(x + cs, y + cs);
            ctx.stroke();
        }
    }

    /** Light noise overlay for visual texture, applied to the specified pixel region. */
    private drawNoiseOverlay(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number,
    ): void {
        const imageData = ctx.getImageData(x, y, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 12;
            data[i] = Math.max(0, Math.min(255, data[i] + noise));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
        }

        ctx.putImageData(imageData, x, y);
    }

    /** Clean up the cached sprite. */
    destroy(): void {
        if (this.cachedSprite) {
            this.cachedSprite.texture.destroy(true);
            this.cachedSprite.destroy();
            this.cachedSprite = null;
        }
        this.canvas = null;
        this.ctx = null;
        this.dirtyTiles.clear();
    }
}
