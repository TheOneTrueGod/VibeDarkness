/**
 * TerrainGrid - Grid data structure storing terrain type at each cell.
 *
 * The game world is divided into cells of a fixed size. Each cell holds
 * a TerrainType value. Provides methods for world<->grid coordinate
 * conversion and terrain lookups.
 */

import { TerrainType, TERRAIN_PROPERTIES } from './TerrainType';
import {
    EARTH_CORE_STONE_DAMAGE_PER_INSTANCE,
    EARTH_CORE_STONE_HEALTH,
} from '../card_defs/earth_core/earthCoreConstants';

/** Default cell size in pixels. */
export const CELL_SIZE = 40;

export type StoneTileState = 'natural_stone' | 'created_rock' | 'cracked_rock' | 'spent_rubble';

export interface StoneTileStateData {
    state: StoneTileState;
    health: number;
}

export interface TerrainStoneDamagedTransition {
    col: number;
    row: number;
    previousState: StoneTileState;
    state: StoneTileState;
    previousHealth: number;
    health: number;
}

export interface SerializedStoneTileMutation {
    col: number;
    row: number;
    state: StoneTileState;
    health: number;
}

export class TerrainGrid {
    /** Number of columns. */
    readonly width: number;
    /** Number of rows. */
    readonly height: number;
    /** Pixel size of each cell. */
    readonly cellSize: number;
    /** Flat array of terrain types (row-major: index = row * width + col). */
    private grid: TerrainType[];
    /** Runtime mutations for rock-state durability tracking. */
    private stoneStateByIndex: Map<number, StoneTileStateData> = new Map();

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
        const index = row * this.width + col;
        this.grid[index] = type;
        if (type !== TerrainType.Rock) {
            this.stoneStateByIndex.delete(index);
        }
    }

    getStoneState(col: number, row: number): StoneTileState {
        if (!this.isInBounds(col, row)) return 'spent_rubble';
        if (this.get(col, row) !== TerrainType.Rock) return 'spent_rubble';
        return this.stoneStateByIndex.get(this.indexOf(col, row))?.state ?? 'natural_stone';
    }

    getStoneHealth(col: number, row: number): number {
        if (!this.isInBounds(col, row)) return 0;
        if (this.get(col, row) !== TerrainType.Rock) return 0;
        return this.stoneStateByIndex.get(this.indexOf(col, row))?.health ?? EARTH_CORE_STONE_HEALTH;
    }

    createOrMarkRock(col: number, row: number): StoneTileStateData | null {
        if (!this.isInBounds(col, row)) return null;
        this.set(col, row, TerrainType.Rock);
        const entry: StoneTileStateData = { state: 'created_rock', health: EARTH_CORE_STONE_HEALTH };
        this.stoneStateByIndex.set(this.indexOf(col, row), entry);
        return { ...entry };
    }

    damageRock(
        col: number,
        row: number,
        damage: number = EARTH_CORE_STONE_DAMAGE_PER_INSTANCE,
    ): TerrainStoneDamagedTransition | null {
        if (!this.isInBounds(col, row)) return null;
        if (this.get(col, row) !== TerrainType.Rock) return null;

        const previousState = this.getStoneState(col, row);
        const previousHealth = this.getStoneHealth(col, row);
        if (previousState === 'spent_rubble' || previousHealth <= 0) return null;

        const nextHealth = Math.max(0, previousHealth - Math.max(0, damage));
        const nextState: StoneTileState = nextHealth <= 0 ? 'spent_rubble' : nextHealth < EARTH_CORE_STONE_HEALTH ? 'cracked_rock' : previousState;

        if (nextState === 'spent_rubble') {
            this.set(col, row, TerrainType.Dirt);
            this.stoneStateByIndex.set(this.indexOf(col, row), { state: nextState, health: 0 });
        } else {
            this.stoneStateByIndex.set(this.indexOf(col, row), { state: nextState, health: nextHealth });
        }

        if ((previousState !== 'cracked_rock' && nextState === 'cracked_rock') || nextState === 'spent_rubble') {
            return {
                col,
                row,
                previousState,
                state: nextState,
                previousHealth,
                health: nextHealth,
            };
        }
        return null;
    }

    consumeRockInRadius(centerCol: number, centerRow: number, radius: number): TerrainStoneDamagedTransition | null {
        const candidates: Array<{ col: number; row: number; state: StoneTileState }> = [];
        const radiusSq = Math.max(0, radius) * Math.max(0, radius);
        for (let row = 0; row < this.height; row++) {
            for (let col = 0; col < this.width; col++) {
                if (this.get(col, row) !== TerrainType.Rock) continue;
                const dx = col - centerCol;
                const dy = row - centerRow;
                if ((dx * dx) + (dy * dy) > radiusSq) continue;
                const state = this.getStoneState(col, row);
                if (state === 'spent_rubble') continue;
                candidates.push({ col, row, state });
            }
        }

        if (candidates.length === 0) return null;

        const preference = (state: StoneTileState): number => {
            if (state === 'created_rock' || state === 'cracked_rock') return 0;
            if (state === 'natural_stone') return 1;
            return 2;
        };
        candidates.sort((a, b) => {
            const prefDiff = preference(a.state) - preference(b.state);
            if (prefDiff !== 0) return prefDiff;
            const da = ((a.col - centerCol) ** 2) + ((a.row - centerRow) ** 2);
            const db = ((b.col - centerCol) ** 2) + ((b.row - centerRow) ** 2);
            if (da !== db) return da - db;
            if (a.row !== b.row) return a.row - b.row;
            return a.col - b.col;
        });

        const selected = candidates[0];
        const previousHealth = this.getStoneHealth(selected.col, selected.row);
        const previousState = this.getStoneState(selected.col, selected.row);
        this.set(selected.col, selected.row, TerrainType.Dirt);
        this.stoneStateByIndex.set(this.indexOf(selected.col, selected.row), { state: 'spent_rubble', health: 0 });
        return {
            col: selected.col,
            row: selected.row,
            previousState,
            state: 'spent_rubble',
            previousHealth,
            health: 0,
        };
    }

    toStoneMutationsJSON(): SerializedStoneTileMutation[] {
        const out: SerializedStoneTileMutation[] = [];
        for (const [index, data] of this.stoneStateByIndex.entries()) {
            if (data.state === 'natural_stone') continue;
            const col = index % this.width;
            const row = Math.floor(index / this.width);
            out.push({ col, row, state: data.state, health: data.health });
        }
        out.sort((a, b) => (a.row - b.row) || (a.col - b.col));
        return out;
    }

    restoreStoneMutationsJSON(data: SerializedStoneTileMutation[] | undefined): void {
        this.stoneStateByIndex.clear();
        if (!data) return;
        for (const mutation of data) {
            if (!this.isInBounds(mutation.col, mutation.row)) continue;
            const index = this.indexOf(mutation.col, mutation.row);
            if (mutation.state === 'spent_rubble') {
                this.grid[index] = TerrainType.Dirt;
                this.stoneStateByIndex.set(index, { state: 'spent_rubble', health: 0 });
                continue;
            }
            this.grid[index] = TerrainType.Rock;
            this.stoneStateByIndex.set(index, {
                state: mutation.state,
                health: Math.max(0, mutation.health),
            });
        }
    }

    private isInBounds(col: number, row: number): boolean {
        return col >= 0 && col < this.width && row >= 0 && row < this.height;
    }

    private indexOf(col: number, row: number): number {
        return row * this.width + col;
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
     * Only Rock is considered obstructing (blocks line of sight).
     */
    hasLineOfSight(fromX: number, fromY: number, toX: number, toY: number): boolean {
        const from = this.worldToGrid(fromX, fromY);
        const to = this.worldToGrid(toX, toY);
        const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row), 1);
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const col = Math.round(from.col + (to.col - from.col) * t);
            const row = Math.round(from.row + (to.row - from.row) * t);
            if (this.get(col, row) === TerrainType.Rock) return false;
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

/**
 * Stitch a 2D grid of terrain "tiles" (each tile is a 2D array of TerrainType) into one 2D array.
 * Tiles are placed left-to-right, top-to-bottom. Missing rows in a tile are padded with fill.
 * Null/undefined tiles are treated as a tile of fill (size from other tiles in same row/column).
 *
 * @param quadrantGrid - [tileRow][tileCol] = TerrainType[][] (or null/undefined for a tile of fill)
 * @param fill - Terrain type for padding and for null/undefined tiles
 */
export function stitchTerrain(
    quadrantGrid: (TerrainType[][] | null | undefined)[][],
    fill: TerrainType,
): TerrainType[][] {
    const tileRows = quadrantGrid.length;
    const tileCols = tileRows > 0 ? Math.max(...quadrantGrid.map((row) => row.length)) : 0;
    if (tileRows === 0 || tileCols === 0) return [];

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

    const result: TerrainType[][] = [];
    for (let tr = 0; tr < tileRows; tr++) {
        const blockH = maxHeightPerRow[tr];
        for (let j = 0; j < blockH; j++) {
            const row: TerrainType[] = [];
            for (let tc = 0; tc < tileCols; tc++) {
                const t = quadrantGrid[tr]?.[tc];
                if (t == null || t.length === 0) {
                    const w = maxWidthPerCol[tc];
                    for (let k = 0; k < w; k++) row.push(fill);
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
