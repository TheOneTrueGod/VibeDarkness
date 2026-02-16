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

    /** World width in pixels. */
    get worldWidth(): number {
        return this.width * this.cellSize;
    }

    /** World height in pixels. */
    get worldHeight(): number {
        return this.height * this.cellSize;
    }

    /** Create a TerrainGrid from a 2D array of terrain types. */
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
