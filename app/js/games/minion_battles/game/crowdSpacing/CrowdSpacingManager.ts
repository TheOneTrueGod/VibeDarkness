/**
 * Owns the ephemeral CrowdSpacingGrid + per-tick contacts and runs one sync + resolve pass per
 * tick. Participation, radius and the resolve itself are delegated to a {@link CrowdSpacingResolver}.
 * Runtime-only — clear on load / prepareForNewGame; never serialize (resolver included).
 */

import type { Unit } from '../units/Unit';
import type { TerrainManager } from '../../terrain/TerrainManager';
import { crowdSpacingCellSizeFromMaxRadius } from './crowdSpacingConstants';
import { CrowdSpacingGrid } from './shared/CrowdSpacingGrid';
import type { CrowdSpacingResolver } from './CrowdSpacingResolver';
import { createCrowdSpacingResolver } from './crowdSpacingMode';

const NO_CONTACTS: readonly string[] = [];

export class CrowdSpacingManager {
    readonly grid = new CrowdSpacingGrid();
    private readonly recordContactBound = (a: Unit, b: Unit): void => this.recordContact(a, b);
    private resolver: CrowdSpacingResolver;

    /** After clear / load, next sync does a full rebuild. */
    private needsRebuild = true;

    /**
     * Unit ids each unit was pressed against during this tick's resolve pass ("bumps"). Rebuilt
     * every tick before AI runs, so it is deterministic without being serialized.
     */
    private contacts = new Map<string, string[]>();

    /**
     * Unit positions recorded by {@link beginTick} before any unit moves this tick, so a resolver
     * can tell who is walking into whom. Runtime-only; dropped at the end of every {@link tick}.
     */
    private readonly tickStartPositions = new Map<string, { x: number; y: number }>();

    constructor(resolver: CrowdSpacingResolver = createCrowdSpacingResolver()) {
        this.resolver = resolver;
    }

    /** Active resolver (runtime-only). */
    getResolver(): CrowdSpacingResolver {
        return this.resolver;
    }

    /**
     * Swap the resolver at runtime (tests / scenarios). Never serialized. Forces a full grid
     * rebuild next tick since participation and radius may differ.
     */
    setResolver(resolver: CrowdSpacingResolver): void {
        this.resolver = resolver;
        this.needsRebuild = true;
    }

    /** Drop grid state — call on prepareForNewGame / fromJSON. Never restore from JSON. */
    clear(): void {
        this.grid.clear();
        this.needsRebuild = true;
        this.contacts.clear();
        this.tickStartPositions.clear();
    }

    /**
     * Snapshot every active unit's position. Call once per tick before any unit moves; the
     * following {@link tick} hands it to the resolver. Without it, nobody counts as having moved.
     */
    beginTick(units: readonly Unit[]): void {
        this.tickStartPositions.clear();
        for (const unit of units) {
            if (!unit.active) continue;
            this.tickStartPositions.set(unit.id, { x: unit.x, y: unit.y });
        }
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
     * Sync resolver participants into the grid, then run one resolve pass.
     * Full rebuild when empty / flagged / cell-size policy changes; otherwise incremental.
     */
    tick(units: readonly Unit[], terrainManager: TerrainManager | null, dt: number, gameTime: number): void {
        this.contacts.clear();
        const participants = this.collectParticipants(units);
        this.syncParticipants(participants);
        if (participants.length > 0) {
            this.resolver.resolve({
                participants,
                grid: this.grid,
                terrainManager,
                dt,
                gameTime,
                tickStartPositions: this.tickStartPositions,
                onContact: this.recordContactBound,
            });
        }
        // A tick without a fresh beginTick must not read stale positions.
        this.tickStartPositions.clear();
    }

    private collectParticipants(units: readonly Unit[]): Unit[] {
        const out: Unit[] = [];
        for (const unit of units) {
            if (!unit.active) continue;
            if (!this.resolver.isParticipant(unit)) continue;
            out.push(unit);
        }
        return out;
    }

    private syncParticipants(participants: readonly Unit[]): void {
        let maxRadius = 0;
        for (const p of participants) {
            const r = this.resolver.radius(p);
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
                    radius: this.resolver.radius(p),
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
            this.grid.updateUnit(p.id, p.x, p.y, this.resolver.radius(p));
        }
    }
}
