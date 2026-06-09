import { TerrainLayerRenderer } from './TerrainLayerRenderer';
import type { TerrainGrid } from './TerrainGrid';
import { TerrainType, TERRAIN_PROPERTIES } from './TerrainType';

export class MarchingSquaresLayerRenderer extends TerrainLayerRenderer {
    override readonly blocksBleed = false;

    constructor(private readonly terrainType: TerrainType) {
        super();
    }

    /**
     * Draw all cells of this terrain type using marching squares.
     * Builds a (W+1)×(H+1) vertex field, then iterates cells to draw blended fill shapes.
     * Skips cells whose terrain type blocks bleed (e.g. hard-edge rock).
     */
    override drawLayer(ctx: CanvasRenderingContext2D, grid: TerrainGrid): void {
        const cs = grid.cellSize;
        const W = grid.width;
        const H = grid.height;
        const terrainType = this.terrainType;

        // Build vertex field: (W+1) × (H+1).
        // Vertex (vx, vy) is "inside" if any of its 4 neighboring cells is the target type.
        const vW = W + 1;
        const vH = H + 1;
        const field = new Uint8Array(vW * vH);

        for (let vy = 0; vy < vH; vy++) {
            for (let vx = 0; vx < vW; vx++) {
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

        ctx.fillStyle = TERRAIN_PROPERTIES[terrainType].color;

        for (let cy = 0; cy < H; cy++) {
            for (let cx = 0; cx < W; cx++) {
                if (TERRAIN_PROPERTIES[grid.get(cx, cy)].blocksBleed) continue;

                const tl = field[cy * vW + cx];
                const tr = field[cy * vW + (cx + 1)];
                const br = field[(cy + 1) * vW + (cx + 1)];
                const bl = field[(cy + 1) * vW + cx];

                const caseIdx = (tl << 3) | (tr << 2) | (br << 1) | bl;
                if (caseIdx === 0) continue;

                this.drawMarchingCase(ctx, cx * cs, cy * cs, cs, caseIdx);
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
    ): void {
        if (TERRAIN_PROPERTIES[getTypeAt(col, row)].blocksBleed) return;

        const terrainType = this.terrainType;
        const cs = _cellSize;

        // Each vertex is "inside" if any of its up-to-4 adjacent cells matches the terrain type.
        // getTypeAt handles OOB (returns Rock), so no explicit bounds check needed.
        const vertexInside = (vx: number, vy: number): boolean => {
            for (let dy = -1; dy <= 0; dy++) {
                for (let dx = -1; dx <= 0; dx++) {
                    if (getTypeAt(vx + dx, vy + dy) === terrainType) return true;
                }
            }
            return false;
        };

        const tl = vertexInside(col,     row)     ? 1 : 0;
        const tr = vertexInside(col + 1, row)     ? 1 : 0;
        const br = vertexInside(col + 1, row + 1) ? 1 : 0;
        const bl = vertexInside(col,     row + 1) ? 1 : 0;

        const caseIdx = (tl << 3) | (tr << 2) | (br << 1) | bl;
        if (caseIdx === 0) return;

        ctx.fillStyle = TERRAIN_PROPERTIES[terrainType].color;
        this.drawMarchingCase(ctx, x, y, cs, caseIdx);
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
}
