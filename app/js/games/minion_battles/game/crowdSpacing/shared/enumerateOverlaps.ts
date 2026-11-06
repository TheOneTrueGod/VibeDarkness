/**
 * Shared CrowdSpacing broad + narrow phase: grid query → unique overlapping pairs in
 * deterministic (unit id ascending) order. Resolvers decide what to do with each pair.
 */

import type { Unit } from '../../units/Unit';
import { CROWD_SPACING_OVERLAP_EPSILON } from '../crowdSpacingConstants';
import type { CrowdSpacingGrid } from './CrowdSpacingGrid';

/** Fallback axis when two units share the exact same center (deterministic). */
export const CROWD_SPACING_COINCIDENT_AXIS_X = 1;
export const CROWD_SPACING_COINCIDENT_AXIS_Y = 0;
const COINCIDENT_DIST_EPSILON = 1e-8;

/** Participants indexed by id, plus their ids sorted ascending (iteration order). */
export type IndexedParticipants = {
    byId: Map<string, Unit>;
    sortedIds: string[];
};

/** Dedupe participants by id and sort ids ascending. */
export function indexCrowdSpacingParticipants(units: Iterable<Unit>): IndexedParticipants {
    const byId = new Map<string, Unit>();
    for (const unit of units) {
        byId.set(unit.id, unit);
    }
    return { byId, sortedIds: [...byId.keys()].sort() };
}

/** One overlapping pair. `a.id < b.id`; normal points from A to B. */
export type CrowdSpacingOverlap = {
    a: Unit;
    b: Unit;
    /** Unit normal from A toward B (coincident axis when centers coincide). */
    nx: number;
    ny: number;
    /** Penetration depth (radiusA + radiusB − dist), always > epsilon. */
    overlap: number;
    /** True when centers coincided and the fallback axis was used. */
    coincident: boolean;
};

export type EnumerateOverlapsArgs = IndexedParticipants & {
    grid: CrowdSpacingGrid;
    radius: (unit: Unit) => number;
    /**
     * Optional cheap filter run before any geometry (e.g. skip anchor–anchor pairs).
     * Pairs it rejects are never visited.
     */
    considerPair?: (a: Unit, b: Unit) => boolean;
    visit: (pair: CrowdSpacingOverlap) => void;
};

/**
 * Visit every unique overlapping pair once, A in ascending id order and B > A ascending.
 * Overlaps ≤ {@link CROWD_SPACING_OVERLAP_EPSILON} are skipped.
 */
export function enumerateCrowdSpacingOverlaps(args: EnumerateOverlapsArgs): void {
    const { byId, sortedIds, grid, radius, considerPair, visit } = args;
    const seenPairs = new Set<string>();
    for (const idA of sortedIds) {
        const a = byId.get(idA)!;
        const radiusA = radius(a);
        const neighbors = grid.queryNeighbors(a.x, a.y, radiusA);
        for (const idB of neighbors) {
            if (idB <= idA) continue;
            if (!byId.has(idB)) continue;
            const pairKey = `${idA}|${idB}`;
            if (seenPairs.has(pairKey)) continue;
            seenPairs.add(pairKey);

            const b = byId.get(idB)!;
            if (considerPair && !considerPair(a, b)) continue;

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            let dist = Math.hypot(dx, dy);
            let nx: number;
            let ny: number;
            let coincident = false;
            if (dist < COINCIDENT_DIST_EPSILON) {
                nx = CROWD_SPACING_COINCIDENT_AXIS_X;
                ny = CROWD_SPACING_COINCIDENT_AXIS_Y;
                dist = 0;
                coincident = true;
            } else {
                nx = dx / dist;
                ny = dy / dist;
            }

            const overlap = radiusA + radius(b) - dist;
            if (overlap <= CROWD_SPACING_OVERLAP_EPSILON) continue;
            visit({ a, b, nx, ny, overlap, coincident });
        }
    }
}
