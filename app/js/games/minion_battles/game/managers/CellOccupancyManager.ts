import type { Unit } from '../units/Unit';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { getUnitMaxPerTile } from '../units/unit_defs/unitDef';

/**
 * Tracks which managed units occupy which grid cells each tick.
 *
 * "Managed" means the unit's def has maxPerTile defined. Other units are invisible
 * to this system and do not count toward cell usage.
 *
 * Tile-space usage per unit object = 1 / maxPerTile (regardless of stackSize).
 * A cell is "full" when totalUsage >= 1.0.
 *
 * Rebuilt from a snapshot of unit positions once per Phase 2 start. Runtime-only — not serialized.
 */
export class CellOccupancyManager {
    private usage: Map<string, number> = new Map();
    private occupants: Map<string, Unit[]> = new Map();

    /** Rebuild from current unit positions. Call once at the start of each movement phase. O(N_managed). */
    rebuild(units: Unit[]): void {
        this.usage.clear();
        this.occupants.clear();

        for (const unit of units) {
            if (!unit.active || !unit.isAlive()) continue;
            const maxPerTile = getUnitMaxPerTile(unit.characterId);
            if (maxPerTile === undefined) continue;

            const col = Math.floor(unit.x / CELL_SIZE);
            const row = Math.floor(unit.y / CELL_SIZE);
            const key = `${col},${row}`;

            this.usage.set(key, (this.usage.get(key) ?? 0) + 1 / maxPerTile);

            const list = this.occupants.get(key);
            if (list) list.push(unit);
            else this.occupants.set(key, [unit]);
        }
    }

    /** Total tile-space usage for this cell. 1.0 = full. */
    getTotalUsage(col: number, row: number): number {
        return this.usage.get(`${col},${row}`) ?? 0;
    }

    /** All managed units currently in this cell (from the last rebuild snapshot). */
    getOccupants(col: number, row: number): Unit[] {
        return this.occupants.get(`${col},${row}`) ?? [];
    }

    /** True if a unit with this maxPerTile can enter the cell without exceeding capacity. */
    canEnter(col: number, row: number, maxPerTile: number): boolean {
        return this.getTotalUsage(col, row) + 1 / maxPerTile <= 1.001;
    }

    /**
     * Extra A* cost for traversing this cell (0 when empty, up to 2.5 when full).
     * Designed so A* accepts ≤ 2.5-tile detours to avoid full cells.
     */
    getOccupancyCost(col: number, row: number): number {
        return Math.min(this.getTotalUsage(col, row) * 2.5, 2.5);
    }
}
