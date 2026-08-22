/**
 * TerrainGrid - Grid data structure storing terrain type at each cell.
 *
 * The game world is divided into cells of a fixed size. Each cell holds
 * a TerrainType value. Provides methods for world<->grid coordinate
 * conversion and terrain lookups.
 */

import { TerrainType, TERRAIN_PROPERTIES } from './TerrainType';

/** Default cell size in pixels. */
export const CELL_SIZE = 40;

export class TerrainGrid {
    /** Number of columns. */
    readonly width: number;
    /** Number of rows. */
    readonly height: number;
    /** Pixel size of each cell. */
    readonly cellSize: number;
    /** Flat array of terrain types (row-major: index = row * width + col). */
    private grid: TerrainType[];

    constructor(
        width: number,
        height: number,
        cellSize: number = CELL_SIZE,
        defaultTerrain: TerrainType = TerrainType.Grass,
    ) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        this.grid = new Array(width * height).fill(defaultTerrain);
    }

    /** World width in pixels (columns × cell size). */
    get worldWidth(): number {
        return this.width * this.cellSize;
    }

    /** World height in pixels (rows × cell size). */
    get worldHeight(): number {
        return this.height * this.cellSize;
    }

    /** Get terrain type at grid coordinates. Out-of-bounds returns Rock. */
    get(col: number, row: number): TerrainType {
        if (col < 0 || col >= this.width || row < 0 || row >= this.height) {
            return TerrainType.Rock;
        }
        return this.grid[row * this.width + col];
    }

    /** Set terrain type at grid coordinates. */
    set(col: number, row: number, type: TerrainType): void {
        if (col < 0 || col >= this.width || row < 0 || row >= this.height) return;
        this.grid[row * this.width + col] = type;
    }

    /** Convert world position to grid coordinates. */
    worldToGrid(worldX: number, worldY: number): { col: number; row: number } {
        return {
            col: Math.floor(worldX / this.cellSize),
            row: Math.floor(worldY / this.cellSize),
        };
    }

    /** Convert grid coordinates to world position (center of cell). */
    gridToWorld(col: number, row: number): { x: number; y: number } {
        return {
            x: col * this.cellSize + this.cellSize / 2,
            y: row * this.cellSize + this.cellSize / 2,
        };
    }

    /** Get terrain type at world position. */
    getAtWorld(worldX: number, worldY: number): TerrainType {
        const { col, row } = this.worldToGrid(worldX, worldY);
        return this.get(col, row);
    }

    /** Check if a world position is passable for units. */
    isPassable(worldX: number, worldY: number): boolean {
        return TERRAIN_PROPERTIES[this.getAtWorld(worldX, worldY)].passable;
    }

    /** Get speed multiplier at a world position. */
    getSpeedMultiplier(worldX: number, worldY: number): number {
        return TERRAIN_PROPERTIES[this.getAtWorld(worldX, worldY)].speedMultiplier;
    }

    /** Check if a world position allows projectiles. */
    isProjectilePassable(worldX: number, worldY: number): boolean {
        return TERRAIN_PROPERTIES[this.getAtWorld(worldX, worldY)].projectilePassable;
    }

    /**
     * True if the line between two world positions does not pass through obstructed terrain.
     * Rock and Impassable are considered obstructing (block line of sight) — Impassable mirrors
     * Rock here since it stands in for "outside the map" (see TerrainType.Impassable).
     */
    hasLineOfSight(fromX: number, fromY: number, toX: number, toY: number): boolean {
        const from = this.worldToGrid(fromX, fromY);
        const to = this.worldToGrid(toX, toY);
        const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row), 1);
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const col = Math.round(from.col + (to.col - from.col) * t);
            const row = Math.round(from.row + (to.row - from.row) * t);
            const type = this.get(col, row);
            if (type === TerrainType.Rock || type === TerrainType.Impassable) return false;
        }
        return true;
    }

    /**
     * Create a TerrainGrid filled entirely with one terrain type.
     * Use this when you don't have a 2D layout (equivalent to the classic constructor).
     */
    static createFilledTerrain(
        cols: number,
        rows: number,
        cellSize: number,
        defaultTerrain: TerrainType = TerrainType.Grass,
    ): TerrainGrid {
        return new TerrainGrid(cols, rows, cellSize, defaultTerrain);
    }

    /**
     * Create a TerrainGrid from a 2D array of terrain types.
     * Grid size is cols × rows; missing or extra cells are padded/trimmed with fill.
     */
    static createTerrainFromArray(
        cols: number,
        rows: number,
        cellSize: number,
        data: TerrainType[][],
        fill: TerrainType = TerrainType.Grass,
    ): TerrainGrid {
        const grid = new TerrainGrid(cols, rows, cellSize, fill);
        for (let r = 0; r < rows; r++) {
            const srcRow = data[r];
            for (let c = 0; c < cols; c++) {
                grid.set(c, r, srcRow?.[c] ?? fill);
            }
        }
        return grid;
    }

    /** Create a TerrainGrid from a 2D array of terrain types (infers dimensions from data). */
    static fromArray(data: TerrainType[][], cellSize: number = CELL_SIZE): TerrainGrid {
        const height = data.length;
        const width = data[0]?.length ?? 0;
        const grid = new TerrainGrid(width, height, cellSize);
        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                grid.set(col, row, data[row][col]);
            }
        }
        return grid;
    }
}

/** Per-tile-column/row sizes and origins produced by {@link stitchTerrain} / the layout composer. */
export interface StitchLayoutMetrics {
    tileRows: number;
    tileCols: number;
    maxHeightPerRow: number[];
    maxWidthPerCol: number[];
    /** Grid-column origin of each tile column (sum of widths to the left). */
    originColByTile: number[];
    /** Grid-row origin of each tile row (sum of heights above). */
    originRowByTile: number[];
    totalWidth: number;
    totalHeight: number;
}

/**
 * Sizing/origin math shared by {@link stitchTerrain} and the mission layout composer so POIs and
 * placements land on the same cells as the stitched bedrock.
 */
export function getStitchLayoutMetrics(
    quadrantGrid: (TerrainType[][] | null | undefined)[][],
): StitchLayoutMetrics {
    const tileRows = quadrantGrid.length;
    const tileCols = tileRows > 0 ? Math.max(...quadrantGrid.map((row) => row.length)) : 0;
    const maxHeightPerRow: number[] = [];
    const maxWidthPerCol: number[] = new Array(tileCols).fill(0);
    for (let tr = 0; tr < tileRows; tr++) {
        let maxH = 0;
        for (let tc = 0; tc < tileCols; tc++) {
            const t = quadrantGrid[tr]?.[tc];
            const h = t?.length ?? 0;
            const w = t?.[0]?.length ?? 0;
            maxH = Math.max(maxH, h);
            if (tc < maxWidthPerCol.length) maxWidthPerCol[tc] = Math.max(maxWidthPerCol[tc], w);
        }
        maxHeightPerRow.push(maxH);
    }

    const originColByTile: number[] = [];
    let totalWidth = 0;
    for (let tc = 0; tc < tileCols; tc++) {
        originColByTile.push(totalWidth);
        totalWidth += maxWidthPerCol[tc] ?? 0;
    }
    const originRowByTile: number[] = [];
    let totalHeight = 0;
    for (let tr = 0; tr < tileRows; tr++) {
        originRowByTile.push(totalHeight);
        totalHeight += maxHeightPerRow[tr] ?? 0;
    }

    return {
        tileRows,
        tileCols,
        maxHeightPerRow,
        maxWidthPerCol,
        originColByTile,
        originRowByTile,
        totalWidth,
        totalHeight,
    };
}

/**
 * Stitch a 2D grid of terrain "tiles" (each tile is a 2D array of TerrainType) into one 2D array.
 * Tiles are placed left-to-right, top-to-bottom. Missing rows/columns within an otherwise-present
 * tile (ragged sizing) are padded with `fill`. A wholly null/undefined tile — e.g. an unused
 * corner of an L-shaped mission layout — is filled with `TerrainType.Impassable` instead of
 * `fill`, sized from sibling tiles in the same row/column: that space has no real terrain data,
 * so it renders as void and blocks movement, rather than pretending to be walkable ground.
 *
 * @param quadrantGrid - [tileRow][tileCol] = TerrainType[][] (or null/undefined for a missing tile)
 * @param fill - Terrain type used only to pad ragged/mismatched-size tiles
 */
export function stitchTerrain(
    quadrantGrid: (TerrainType[][] | null | undefined)[][],
    fill: TerrainType,
): TerrainType[][] {
    const metrics = getStitchLayoutMetrics(quadrantGrid);
    if (metrics.tileRows === 0 || metrics.tileCols === 0) return [];

    const { tileRows, tileCols, maxHeightPerRow, maxWidthPerCol } = metrics;
    const result: TerrainType[][] = [];
    for (let tr = 0; tr < tileRows; tr++) {
        const blockH = maxHeightPerRow[tr];
        for (let j = 0; j < blockH; j++) {
            const row: TerrainType[] = [];
            for (let tc = 0; tc < tileCols; tc++) {
                const t = quadrantGrid[tr]?.[tc];
                if (t == null || t.length === 0) {
                    const w = maxWidthPerCol[tc];
                    for (let k = 0; k < w; k++) row.push(TerrainType.Impassable);
                    continue;
                }
                const tileWidth = t[0]?.length ?? 0;
                if (j >= t.length) {
                    for (let k = 0; k < tileWidth; k++) row.push(fill);
                } else {
                    const srcRow = t[j];
                    for (let c = 0; c < tileWidth; c++) row.push(srcRow?.[c] ?? fill);
                }
            }
            result.push(row);
        }
    }
    return result;
}
