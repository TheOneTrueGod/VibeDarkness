/**
 * TerrainRenderer - Renders terrain using marching squares to a cached PixiJS Sprite.
 *
 * Draws terrain layers (dirt base, then grass, thick grass, rocks) using a
 * marching squares algorithm for smooth terrain boundary transitions. The
 * result is rendered to an offscreen canvas and converted to a PixiJS Sprite
 * that is added to the game scene once and never redrawn.
 */

import { Sprite, Texture } from 'pixi.js';
import { TerrainGrid } from './TerrainGrid';
import { TerrainType, TERRAIN_PROPERTIES } from './TerrainType';

/**
 * Render order: layers are drawn bottom to top so higher-priority
 * terrain types paint over lower ones.
 */
const LAYER_ORDER: TerrainType[] = [
    TerrainType.Grass,
    TerrainType.ThickGrass,
    TerrainType.Rock,
];

export class TerrainRenderer {
    private cachedSprite: Sprite | null = null;

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
        this.drawGridOverlay(ctx, grid);

        // Add noise texture for visual interest
        this.drawNoiseOverlay(ctx, worldW, worldH);

        // Convert canvas to PixiJS Sprite
        const texture = Texture.from({ resource: canvas, label: 'terrain' });
        const sprite = new Sprite(texture);
        sprite.x = 0;
        sprite.y = 0;
        sprite.label = 'terrain';

        this.cachedSprite = sprite;
        return sprite;
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

    /** Subtle grid lines for visual reference. */
    private drawGridOverlay(ctx: CanvasRenderingContext2D, grid: TerrainGrid): void {
        const cs = grid.cellSize;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.lineWidth = 1;

        for (let c = 1; c < grid.width; c++) {
            ctx.beginPath();
            ctx.moveTo(c * cs, 0);
            ctx.lineTo(c * cs, grid.height * cs);
            ctx.stroke();
        }

        for (let r = 1; r < grid.height; r++) {
            ctx.beginPath();
            ctx.moveTo(0, r * cs);
            ctx.lineTo(grid.width * cs, r * cs);
            ctx.stroke();
        }
    }

    /** Light noise overlay for visual texture. */
    private drawNoiseOverlay(
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
    ): void {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 12;
            data[i] = Math.max(0, Math.min(255, data[i] + noise));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
        }

        ctx.putImageData(imageData, 0, 0);
    }

    /** Clean up the cached sprite. */
    destroy(): void {
        if (this.cachedSprite) {
            this.cachedSprite.texture.destroy(true);
            this.cachedSprite.destroy();
            this.cachedSprite = null;
        }
    }
}
