/**
 * LightTileGrid — persistent per-tile light state stored in GameState.
 *
 * Divided into quadrants of LIGHT_QUADRANT_SIZE × LIGHT_QUADRANT_SIZE tiles
 * (matching the terrain segment size) for future batch update support.
 * Each quadrant is stored as a flat number[] in row-major order.
 */

/** Tile size of each quadrant edge — matches terrain segment size. */
export const LIGHT_QUADRANT_SIZE = 22;

export interface LightTileGridJSON {
    w: number;
    h: number;
    /** Flat tile arrays per quadrant, in row-major quadrant order (qRow * qCols + qCol). */
    q: number[][];
}

export class LightTileGrid {
    readonly gridWidth: number;
    readonly gridHeight: number;
    readonly qCols: number;
    readonly qRows: number;
    readonly quadrants: number[][];

    private constructor(gridWidth: number, gridHeight: number) {
        this.gridWidth = gridWidth;
        this.gridHeight = gridHeight;
        this.qCols = Math.ceil(gridWidth / LIGHT_QUADRANT_SIZE);
        this.qRows = Math.ceil(gridHeight / LIGHT_QUADRANT_SIZE);
        this.quadrants = Array.from({ length: this.qRows * this.qCols }, () =>
            new Array(LIGHT_QUADRANT_SIZE * LIGHT_QUADRANT_SIZE).fill(0),
        );
    }

    static create(gridWidth: number, gridHeight: number, initialValue = 0): LightTileGrid {
        const g = new LightTileGrid(gridWidth, gridHeight);
        if (initialValue !== 0) g.fill(initialValue);
        return g;
    }

    get(row: number, col: number): number {
        const qRow = Math.floor(row / LIGHT_QUADRANT_SIZE);
        const qCol = Math.floor(col / LIGHT_QUADRANT_SIZE);
        const qi = qRow * this.qCols + qCol;
        const localRow = row - qRow * LIGHT_QUADRANT_SIZE;
        const localCol = col - qCol * LIGHT_QUADRANT_SIZE;
        return this.quadrants[qi]?.[localRow * LIGHT_QUADRANT_SIZE + localCol] ?? 0;
    }

    set(row: number, col: number, value: number): void {
        const qRow = Math.floor(row / LIGHT_QUADRANT_SIZE);
        const qCol = Math.floor(col / LIGHT_QUADRANT_SIZE);
        const qi = qRow * this.qCols + qCol;
        const localRow = row - qRow * LIGHT_QUADRANT_SIZE;
        const localCol = col - qCol * LIGHT_QUADRANT_SIZE;
        const q = this.quadrants[qi];
        if (q) q[localRow * LIGHT_QUADRANT_SIZE + localCol] = value;
    }

    fill(value: number): void {
        for (const q of this.quadrants) q.fill(value);
    }

    toJSON(): LightTileGridJSON {
        return {
            w: this.gridWidth,
            h: this.gridHeight,
            q: this.quadrants.map((q) => Array.from(q)),
        };
    }

    static fromJSON(data: LightTileGridJSON): LightTileGrid {
        const g = new LightTileGrid(data.w, data.h);
        for (let i = 0; i < g.quadrants.length; i++) {
            const src = data.q[i];
            if (src) g.quadrants[i] = Array.from(src);
        }
        return g;
    }
}
