/**
 * Owns the ephemeral CrowdSpacingGrid and runs one sync + resolve pass per tick.
 * Runtime-only — clear on load / prepareForNewGame; never serialize.
 */

import type { Unit } from '../units/Unit';
import type { TerrainManager } from '../../terrain/TerrainManager';
import { crowdSpacingCellSizeFromMaxRadius } from './crowdSpacingConstants';
import { CrowdSpacingGrid } from './CrowdSpacingGrid';
import { getCrowdSpacingRadius, getCrowdSpacingRole } from './crowdSpacingRoles';
import { resolveCrowdSpacingPass } from './resolveCrowdSpacing';

const NO_CONTACTS: readonly string[] = [];

export class CrowdSpacingManager {
    readonly grid = new CrowdSpacingGrid();
    private readonly recordContactBound = (a: Unit, b: Unit): void => this.recordContact(a, b);

    /** After clear / load, next sync does a full rebuild. */
    private needsRebuild = true;

    /**
     * Unit ids each unit was pressed against during this tick's resolve pass ("bumps"). Rebuilt
     * every tick before AI runs, so it is deterministic without being serialized.
     */
    private contacts = new Map<string, string[]>();

    /** Drop grid state — call on prepareForNewGame / fromJSON. Never restore from JSON. */
    clear(): void {
        this.grid.clear();
        this.needsRebuild = true;
        this.contacts.clear();
    }

    /** Ids of units `unitId` overlapped this tick (both directions; empty when none). */
    getContacts(unitId: string): readonly string[] {
        return this.contacts.get(unitId) ?? NO_CONTACTS;
    }

    private recordContact(a: Unit, b: Unit): void {
        const listA = this.contacts.get(a.id);
        if (listA) listA.push(b.id);
        else this.contacts.set(a.id, [b.id]);
        const listB = this.contacts.get(b.id);
        if (listB) listB.push(a.id);
        else this.contacts.set(b.id, [a.id]);
    }

    /**
     * Sync soft + anchor participants into the grid, then run one resolve pass.
     * Full rebuild when empty / flagged / cell-size policy changes; otherwise incremental.
     */
    tick(units: readonly Unit[], terrainManager: TerrainManager | null): void {
        this.contacts.clear();
        const participants = this.collectParticipants(units);
        this.syncParticipants(participants);
        if (participants.length === 0) return;
        resolveCrowdSpacingPass({
            units: participants,
            grid: this.grid,
            terrainManager,
            onContact: this.recordContactBound,
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
            const r = getCrowdSpacingRadius(p);
            if (r > maxRadius) maxRadius = r;
        }
        const desiredCellSize = crowdSpacingCellSizeFromMaxRadius(maxRadius);
        const trackedEmpty = this.grid.trackedCount === 0;

        if (this.needsRebuild || trackedEmpty || this.grid.cellSize !== desiredCellSize) {
            this.grid.rebuild(
                participants.map((p) => ({
                    id: p.id,
                    x: p.x,
                    y: p.y,
                    radius: getCrowdSpacingRadius(p),
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
            this.grid.updateUnit(p.id, p.x, p.y, getCrowdSpacingRadius(p));
        }
    }
}
