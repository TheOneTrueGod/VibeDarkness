/**
 * Owns the ephemeral CrowdSpacingGrid and runs one sync + resolve pass per tick.
 * Runtime-only — clear on load / prepareForNewGame; never serialize.
 */

import type { Unit } from '../units/Unit';
import type { TerrainManager } from '../../terrain/TerrainManager';
import { crowdSpacingCellSizeFromMaxRadius } from './crowdSpacingConstants';
import { CrowdSpacingGrid } from './CrowdSpacingGrid';
import { getCrowdSpacingRole } from './crowdSpacingRoles';
import { resolveCrowdSpacingPass } from './resolveCrowdSpacing';

export class CrowdSpacingManager {
    readonly grid = new CrowdSpacingGrid();

    /** After clear / load, next sync does a full rebuild. */
    private needsRebuild = true;

    /** Drop grid state — call on prepareForNewGame / fromJSON. Never restore from JSON. */
    clear(): void {
        this.grid.clear();
        this.needsRebuild = true;
    }

    /**
     * Sync soft + anchor participants into the grid, then run one resolve pass.
     * Full rebuild when empty / flagged / cell-size policy changes; otherwise incremental.
     */
    tick(units: readonly Unit[], terrainManager: TerrainManager | null): void {
        const participants = this.collectParticipants(units);
        this.syncParticipants(participants);
        if (participants.length === 0) return;
        resolveCrowdSpacingPass({
            units: participants,
            grid: this.grid,
            terrainManager,
        });
    }

    private collectParticipants(units: readonly Unit[]): Unit[] {
        const out: Unit[] = [];
        for (const unit of units) {
            if (!unit.active) continue;
            if (getCrowdSpacingRole(unit) === 'exempt') continue;
            out.push(unit);
        }
        return out;
    }

    private syncParticipants(participants: readonly Unit[]): void {
        let maxRadius = 0;
        for (const p of participants) {
            if (p.radius > maxRadius) maxRadius = p.radius;
        }
        const desiredCellSize = crowdSpacingCellSizeFromMaxRadius(maxRadius);
        const trackedEmpty = this.grid.trackedCount === 0;

        if (this.needsRebuild || trackedEmpty || this.grid.cellSize !== desiredCellSize) {
            this.grid.rebuild(
                participants.map((p) => ({
                    id: p.id,
                    x: p.x,
                    y: p.y,
                    radius: p.radius,
                })),
                desiredCellSize,
            );
            this.needsRebuild = false;
            return;
        }

        const wanted = new Set(participants.map((p) => p.id));
        for (const id of this.grid.trackedIds()) {
            if (!wanted.has(id)) this.grid.removeUnit(id);
        }
        for (const p of participants) {
            this.grid.updateUnit(p.id, p.x, p.y, p.radius);
        }
    }
}
