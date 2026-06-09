import type { TerrainGrid } from './TerrainGrid';
import type { TerrainType } from './TerrainType';

/**
 * Contract for a single terrain layer's rendering strategy.
 * Concrete subclasses implement the two draw methods (full layer and single cell)
 * without any knowledge of which other terrain types exist.
 */
export abstract class TerrainLayerRenderer {
    /** Draw all cells of this terrain type — full-grid pass used by buildSprite. */
    abstract drawLayer(ctx: CanvasRenderingContext2D, grid: TerrainGrid): void;

    /**
     * Repaint a single cell — used by repaintCell.
     * getTypeAt handles OOB (returns Rock for out-of-bounds, matching TerrainGrid.get semantics).
     */
    abstract drawCell(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        cellSize: number,
        col: number,
        row: number,
        getTypeAt: (c: number, r: number) => TerrainType,
    ): void;

    /**
     * If true, marching-squares layers must skip cells of this terrain type.
     * Hard-edge terrain blocks soft-terrain bleed from adjacent layers.
     */
    readonly blocksBleed: boolean = false;
}
