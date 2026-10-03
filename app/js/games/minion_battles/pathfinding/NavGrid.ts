/**
 * NavGrid - Per-profile passability and step-cost grid.
 *
 * Maintains typed-array snapshots of passable cells and integer step costs
 * for each nav profile (`default` and `enemy`). Lazily computes connected-
 * component labels for reachability checks. Marks cells dirty and flushes
 * them to re-derive cost and component labels only when needed.
 */

import { TERRAIN_PROPERTIES } from '../terrain/TerrainType';
import type { TerrainManager } from '../terrain/TerrainManager';
import type { NavProfileId } from './navProfile';

/** Connected-component label for a cell. Used to check reachability without searching. */
const COMPONENT_UNREACHABLE = 0;
const COMPONENT_START = 1;

/** Cost assigned to impassable cells. */
export const NAV_IMPASSABLE_COST = 65535;

export class NavGrid {
    readonly width: number;
    readonly height: number;

    /** Per-profile passability (Uint8Array: 0=impassable, 1=passable). */
    private passable: { default: Uint8Array; enemy: Uint8Array };
    /** Per-profile step costs (Uint16Array, normalized to integers). */
    private stepCosts: { default: Uint16Array; enemy: Uint16Array };

    /** Per-profile connected-component labels. Invalidated on flush-with-changes. */
    private componentLabels: {
        default: Uint32Array | null;
        enemy: Uint32Array | null;
    } = { default: null, enemy: null };

    /** Dirty cell set (as numeric cell indices). Cleared on flush. */
    private dirtyCells: Set<number> = new Set();
    /** True if the entire grid was marked dirty. */
    private isFullyDirty: boolean = true;

    private terrainManager: TerrainManager;
    private getCrystalProtection: () => Map<string, number>;

    constructor(
        terrainManager: TerrainManager,
        getCrystalProtection: () => Map<string, number>,
    ) {
        const terrainGrid = terrainManager.grid;
        this.width = terrainGrid.width;
        this.height = terrainGrid.height;
        this.terrainManager = terrainManager;
        this.getCrystalProtection = getCrystalProtection;

        const size = this.width * this.height;

        // Allocate typed arrays; they'll be populated on first flush.
        this.passable = { default: new Uint8Array(size), enemy: new Uint8Array(size) };
        this.stepCosts = { default: new Uint16Array(size), enemy: new Uint16Array(size) };

        // Mark entire grid as dirty so flush() will rebuild everything.
        this.isFullyDirty = true;
    }

    private computeStepCost(weight: number): number {
        // Cardinal = 10 * weight, convert to integer and cap at 65535.
        if (!Number.isFinite(weight) || weight <= 0) return NAV_IMPASSABLE_COST;
        const cost = Math.round(10 * weight);
        return Math.min(NAV_IMPASSABLE_COST, cost);
    }

    /** Mark a cell as dirty (passability or cost changed). */
    markDirty(col: number, row: number): void {
        if (col < 0 || col >= this.width || row < 0 || row >= this.height) return;
        const idx = row * this.width + col;
        this.dirtyCells.add(idx);
        // Invalidate component labels; they'll be recomputed lazily.
        this.componentLabels.default = null;
        this.componentLabels.enemy = null;
    }

    /** Mark the entire grid as dirty. */
    markAllDirty(): void {
        this.isFullyDirty = true;
        this.dirtyCells.clear();
        this.componentLabels.default = null;
        this.componentLabels.enemy = null;
    }

    /**
     * Rebuild passability and step cost for dirty cells.
     * This must be called before querying passability or costs after terrain changes.
     * Also re-derives connected-component labels if any dirty cells exist.
     */
    flush(): void {
        if (!this.isFullyDirty && this.dirtyCells.size === 0) {
            return;  // Already clean.
        }

        const crystalBlockedCells = this.getCrystalProtection();

        if (this.isFullyDirty) {
            const size = this.width * this.height;
            for (let idx = 0; idx < size; idx++) {
                this.rebuildCell(idx, crystalBlockedCells);
            }
        } else {
            for (const idx of this.dirtyCells) {
                this.rebuildCell(idx, crystalBlockedCells);
            }
        }

        this.isFullyDirty = false;
        this.dirtyCells.clear();

        // Reset component labels; they'll be recomputed lazily.
        this.componentLabels.default = null;
        this.componentLabels.enemy = null;
    }

    private rebuildCell(idx: number, crystalMap: Map<string, number>): void {
        const col = idx % this.width;
        const row = Math.floor(idx / this.width);

        const terrainType = this.terrainManager.getEffectiveTerrainType(col, row);
        const props = TERRAIN_PROPERTIES[terrainType];

        // Default profile: terrain-only.
        this.passable.default[idx] = props.passable ? 1 : 0;
        this.stepCosts.default[idx] = this.computeStepCost(props.pathfindingWeight);

        // Enemy profile: terrain + crystal-protected blocks.
        const isCrystalBlocked = crystalMap.has(`${col},${row}`);
        this.passable.enemy[idx] = props.passable && !isCrystalBlocked ? 1 : 0;
        this.stepCosts.enemy[idx] = this.computeStepCost(props.pathfindingWeight);
    }

    /** Check if a cell is passable for a profile. Out-of-bounds = impassable. */
    isPassable(profile: NavProfileId, col: number, row: number): boolean {
        if (col < 0 || col >= this.width || row < 0 || row >= this.height) return false;
        const idx = row * this.width + col;
        return this.isPassableIdx(profile, idx);
    }

    /** Check if a cell (by index) is passable for a profile. */
    isPassableIdx(profile: NavProfileId, idx: number): boolean {
        if (idx < 0 || idx >= this.width * this.height) return false;
        return this.passable[profile][idx] === 1;
    }

    /** Get integer step cost for a cell (or NAV_IMPASSABLE_COST if impassable). */
    stepCost(profile: NavProfileId, idx: number): number {
        if (idx < 0 || idx >= this.width * this.height) return NAV_IMPASSABLE_COST;
        return this.stepCosts[profile][idx];
    }

    /**
     * Check if two cells are in the same connected component (8-connected with
     * diagonal corner rule). Returns true only if both are reachable and in the
     * same component.
     */
    sameComponent(profile: NavProfileId, idxA: number, idxB: number): boolean {
        if (!this.isPassableIdx(profile, idxA) || !this.isPassableIdx(profile, idxB)) {
            return false;
        }

        const labels = this.getComponentLabels(profile);
        if (!labels || labels[idxA] === COMPONENT_UNREACHABLE || labels[idxB] === COMPONENT_UNREACHABLE) {
            return false;
        }

        return labels[idxA] === labels[idxB];
    }

    private getComponentLabels(profile: NavProfileId): Uint32Array | null {
        if (this.componentLabels[profile]) {
            return this.componentLabels[profile];
        }

        // Lazily compute connected-component labels.
        const labels = new Uint32Array(this.width * this.height);
        labels.fill(COMPONENT_UNREACHABLE);

        let nextLabel = COMPONENT_START;
        // One queue shared by every flood fill: each cell is enqueued at most once overall.
        const queueBuffer = new Int32Array(this.width * this.height);

        for (let i = 0; i < this.width * this.height; i++) {
            if (labels[i] !== COMPONENT_UNREACHABLE || !this.isPassableIdx(profile, i)) {
                continue;  // Already labeled or impassable.
            }

            // Flood-fill from this cell with a new label.
            this.floodFillComponent(profile, i, nextLabel, labels, queueBuffer);
            nextLabel++;
        }

        this.componentLabels[profile] = labels;
        return labels;
    }

    private floodFillComponent(
        profile: NavProfileId,
        startIdx: number,
        label: number,
        labels: Uint32Array,
        queueBuffer: Int32Array,
    ): void {
        let head = 0;
        let tail = 0;

        queueBuffer[tail++] = startIdx;
        labels[startIdx] = label;

        const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
        const dy = [-1, -1, -1, 0, 0, 1, 1, 1];

        while (head < tail) {
            const idx = queueBuffer[head++];
            const col = idx % this.width;
            const row = Math.floor(idx / this.width);

            for (let d = 0; d < 8; d++) {
                const nc = col + dx[d];
                const nr = row + dy[d];

                if (nc < 0 || nc >= this.width || nr < 0 || nr >= this.height) continue;

                const nidx = nr * this.width + nc;
                if (labels[nidx] !== COMPONENT_UNREACHABLE) continue;
                if (!this.isPassableIdx(profile, nidx)) continue;

                // Diagonal corner rule: if moving diagonally, both orthogonal neighbours must be passable.
                if (dx[d] !== 0 && dy[d] !== 0) {
                    const orth1idx = row * this.width + (col + dx[d]); // Horizontal neighbor
                    const orth2idx = (row + dy[d]) * this.width + col; // Vertical neighbor
                    if (!this.isPassableIdx(profile, orth1idx) || !this.isPassableIdx(profile, orth2idx)) {
                        continue;
                    }
                }

                labels[nidx] = label;
                queueBuffer[tail++] = nidx;
            }
        }
    }
}
