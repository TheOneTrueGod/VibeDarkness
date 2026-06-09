/**
 * TerrainRenderer - Renders terrain using per-type layer renderers to a cached PixiJS Sprite.
 *
 * Each terrain type declares a render strategy in TERRAIN_PROPERTIES. TerrainRenderer obtains
 * the correct TerrainLayerRenderer via getRenderer() and delegates all drawing to it. The
 * result is baked into an offscreen canvas and converted to a PixiJS Sprite once per battle.
 *
 * Dynamic updates: call `invalidateTile(col, row)` when a floor tile changes effective terrain
 * (e.g. rock → rubble), then `update(tm)` each frame to repaint dirty cells using effective
 * terrain (floor + bedrock).
 */

import { Sprite, Texture } from 'pixi.js';
import { TerrainGrid } from './TerrainGrid';
import { TerrainType, TERRAIN_PROPERTIES } from './TerrainType';
import type { TerrainManager } from './TerrainManager';
import type { TerrainLayerRenderer } from './TerrainLayerRenderer';
import { MarchingSquaresLayerRenderer } from './MarchingSquaresLayerRenderer';
import { HardEdgeLayerRenderer } from './HardEdgeLayerRenderer';

/**
 * Render order: layers are drawn bottom to top so higher-priority
 * terrain types paint over lower ones.
 * Rock last so grass/thick grass edges do not paint over stone.
 */
const LAYER_ORDER: TerrainType[] = [
    TerrainType.Grass,
    TerrainType.ThickGrass,
    TerrainType.Dirt,
    TerrainType.Rubble,
    TerrainType.Rock,
];

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

    private readonly layerRenderers = new Map<TerrainType, TerrainLayerRenderer>();

    /**
     * Returns the cached layer renderer for a terrain type, creating it on first use.
     * The concrete class is chosen from the type's renderStrategy in TERRAIN_PROPERTIES.
     */
    private getRenderer(terrainType: TerrainType): TerrainLayerRenderer {
        let r = this.layerRenderers.get(terrainType);
        if (!r) {
            r = TERRAIN_PROPERTIES[terrainType].renderStrategy === 'hard-edge'
                ? new HardEdgeLayerRenderer(terrainType)
                : new MarchingSquaresLayerRenderer(terrainType);
            this.layerRenderers.set(terrainType, r);
        }
        return r;
    }

    /**
     * Build the terrain sprite. Call once when the battle starts.
     * Returns a PixiJS Sprite that should be added at the bottom of the scene.
     */
    buildSprite(grid: TerrainGrid): Sprite {
        if (this.cachedSprite) return this.cachedSprite;

        const worldW = grid.width * grid.cellSize;
        const worldH = grid.height * grid.cellSize;

        const canvas = document.createElement('canvas');
        canvas.width = worldW;
        canvas.height = worldH;
        const ctx = canvas.getContext('2d')!;

        // Base layer: fill with dirt
        ctx.fillStyle = TERRAIN_PROPERTIES[TerrainType.Dirt].color;
        ctx.fillRect(0, 0, worldW, worldH);

        for (const terrainType of LAYER_ORDER) {
            this.getRenderer(terrainType).drawLayer(ctx, grid);
        }

        this.drawGridOverlay(ctx, grid.cellSize, grid.width, grid.height);
        this.drawNoiseOverlay(ctx, 0, 0, worldW, worldH);

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

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, cs, cs);
        ctx.clip();

        ctx.clearRect(x, y, cs, cs);
        ctx.fillStyle = TERRAIN_PROPERTIES[TerrainType.Dirt].color;
        ctx.fillRect(x, y, cs, cs);

        const getTypeAt = (c: number, r: number): TerrainType => tm.getEffectiveTerrainType(c, r);

        for (const terrainType of LAYER_ORDER) {
            this.getRenderer(terrainType).drawCell(ctx, x, y, cs, col, row, getTypeAt);
        }

        this.drawGridOverlayCell(ctx, col, row, cs);

        ctx.restore();

        // Noise is applied via getImageData/putImageData which ignore clip; apply after restore.
        this.drawNoiseOverlay(ctx, x, y, cs, cs);
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
        this.layerRenderers.clear();
    }
}
