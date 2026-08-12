/**
 * Ephemeral uniform-grid spatial index for CrowdSpacing.
 * Runtime-only acceleration — rebuild after load/resync; never serialize or checkpoint.
 */

import {
    CROWD_SPACING_FALLBACK_CELL_SIZE,
    crowdSpacingCellSizeFromMaxRadius,
} from './crowdSpacingConstants';

/** Minimal pose needed to place a participant in the grid. */
export type CrowdSpacingParticipant = {
    id: string;
    x: number;
    y: number;
    radius: number;
};

type UnitPlacement = {
    x: number;
    y: number;
    radius: number;
    cellKeys: string[];
};

function cellKey(col: number, row: number): string {
    return `${col},${row}`;
}

/** Inclusive cell range covered by a circle in world space. */
function cellsForCircle(
    x: number,
    y: number,
    radius: number,
    cellSize: number,
): { minCol: number; maxCol: number; minRow: number; maxRow: number } {
    return {
        minCol: Math.floor((x - radius) / cellSize),
        maxCol: Math.floor((x + radius) / cellSize),
        minRow: Math.floor((y - radius) / cellSize),
        maxRow: Math.floor((y + radius) / cellSize),
    };
}

export class CrowdSpacingGrid {
    private cells = new Map<string, Set<string>>();
    private units = new Map<string, UnitPlacement>();
    private _cellSize = CROWD_SPACING_FALLBACK_CELL_SIZE;

    /** Current cell size (set by the last rebuild / clear). */
    get cellSize(): number {
        return this._cellSize;
    }

    /** Number of units currently tracked in the grid. */
    get trackedCount(): number {
        return this.units.size;
    }

    /** Ids currently in the grid (for incremental sync remove). */
    trackedIds(): IterableIterator<string> {
        return this.units.keys();
    }

    clear(): void {
        this.cells.clear();
        this.units.clear();
        this._cellSize = CROWD_SPACING_FALLBACK_CELL_SIZE;
    }

    /**
     * Full rebuild from participants.
     * Cell size defaults to `crowdSpacingCellSizeFromMaxRadius(max radius)`; pass `cellSize` to override.
     */
    rebuild(participants: readonly CrowdSpacingParticipant[], cellSize?: number): void {
        this.cells.clear();
        this.units.clear();

        let maxRadius = 0;
        for (const p of participants) {
            if (p.radius > maxRadius) maxRadius = p.radius;
        }
        this._cellSize =
            cellSize !== undefined
                ? cellSize
                : crowdSpacingCellSizeFromMaxRadius(maxRadius);

        for (const p of participants) {
            this.insertUnit(p.id, p.x, p.y, p.radius);
        }
    }

    /** Move / re-insert a unit (incremental play path). */
    updateUnit(unitId: string, x: number, y: number, radius: number): void {
        this.removeUnitFromCells(unitId);
        this.insertUnit(unitId, x, y, radius);
    }

    removeUnit(unitId: string): void {
        this.removeUnitFromCells(unitId);
        this.units.delete(unitId);
    }

    /**
     * Broad-phase: unique unit ids whose cells overlap the query circle.
     * Sorted ascending for stable downstream pair enumeration.
     */
    queryNeighbors(x: number, y: number, radius: number): string[] {
        const { minCol, maxCol, minRow, maxRow } = cellsForCircle(
            x,
            y,
            radius,
            this._cellSize,
        );
        const found = new Set<string>();
        for (let col = minCol; col <= maxCol; col++) {
            for (let row = minRow; row <= maxRow; row++) {
                const bucket = this.cells.get(cellKey(col, row));
                if (!bucket) continue;
                for (const id of bucket) found.add(id);
            }
        }
        return [...found].sort();
    }

    private insertUnit(unitId: string, x: number, y: number, radius: number): void {
        const { minCol, maxCol, minRow, maxRow } = cellsForCircle(
            x,
            y,
            radius,
            this._cellSize,
        );
        const cellKeys: string[] = [];
        for (let col = minCol; col <= maxCol; col++) {
            for (let row = minRow; row <= maxRow; row++) {
                const key = cellKey(col, row);
                cellKeys.push(key);
                let bucket = this.cells.get(key);
                if (!bucket) {
                    bucket = new Set();
                    this.cells.set(key, bucket);
                }
                bucket.add(unitId);
            }
        }
        this.units.set(unitId, { x, y, radius, cellKeys });
    }

    private removeUnitFromCells(unitId: string): void {
        const placement = this.units.get(unitId);
        if (!placement) return;
        for (const key of placement.cellKeys) {
            const bucket = this.cells.get(key);
            if (!bucket) continue;
            bucket.delete(unitId);
            if (bucket.size === 0) this.cells.delete(key);
        }
    }
}
