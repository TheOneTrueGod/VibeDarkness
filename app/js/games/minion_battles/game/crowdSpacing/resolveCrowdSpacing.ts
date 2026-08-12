/**
 * One-pass CrowdSpacing resolve: soft radius packing with terrain-clamped instant corrections.
 */

import type { Unit } from '../units/Unit';
import type { TerrainGrid } from '../../terrain/TerrainGrid';
import type { TerrainManager } from '../../terrain/TerrainManager';
import { clampNudgeVectorToTerrain } from '../units/unitNudge';
import { CROWD_SPACING_OVERLAP_EPSILON } from './crowdSpacingConstants';
import { CrowdSpacingGrid } from './CrowdSpacingGrid';
import { getCrowdSpacingRole, getCrowdSpacingWeight } from './crowdSpacingRoles';

/** Fallback axis when two units share the exact same center (deterministic). */
const COINCIDENT_AXIS_X = 1;
const COINCIDENT_AXIS_Y = 0;
const COINCIDENT_DIST_EPSILON = 1e-8;

export type ResolveCrowdSpacingPassArgs = {
    /** Participants already in the grid (soft + anchor). Exempt units must not be included. */
    units: Iterable<Unit>;
    grid: CrowdSpacingGrid;
    terrainManager?: TerrainManager | null;
    /** Bedrock / passability grid when no TerrainManager is available. */
    terrainGrid?: TerrainGrid | null;
};

type Vec2 = { x: number; y: number };

/**
 * Single separation pass over unique overlapping pairs (unitId ascending).
 * Soft–soft: inverse-weight split of overlap depth. Soft–anchor: full correction on soft.
 * Anchor–anchor: no-op. Soft deltas are terrain-clamped before apply; grid cells refreshed.
 */
export function resolveCrowdSpacingPass(args: ResolveCrowdSpacingPassArgs): void {
    const { units, grid, terrainManager, terrainGrid } = args;

    const byId = new Map<string, Unit>();
    for (const unit of units) {
        byId.set(unit.id, unit);
    }
    if (byId.size === 0) return;

    const sortedIds = [...byId.keys()].sort();
    const deltas = new Map<string, Vec2>();

    const addDelta = (id: string, dx: number, dy: number): void => {
        const prev = deltas.get(id);
        if (prev) {
            prev.x += dx;
            prev.y += dy;
        } else {
            deltas.set(id, { x: dx, y: dy });
        }
    };

    /** Unique overlapping pairs, enumerated in deterministic id order. */
    const seenPairs = new Set<string>();
    for (const idA of sortedIds) {
        const a = byId.get(idA)!;
        const neighbors = grid.queryNeighbors(a.x, a.y, a.radius);
        for (const idB of neighbors) {
            if (idB <= idA) continue;
            if (!byId.has(idB)) continue;
            const pairKey = `${idA}|${idB}`;
            if (seenPairs.has(pairKey)) continue;
            seenPairs.add(pairKey);

            const b = byId.get(idB)!;
            const roleA = getCrowdSpacingRole(a);
            const roleB = getCrowdSpacingRole(b);
            if (roleA === 'exempt' || roleB === 'exempt') continue;
            if (roleA === 'anchor' && roleB === 'anchor') continue;

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            let dist = Math.hypot(dx, dy);
            let nx: number;
            let ny: number;
            if (dist < COINCIDENT_DIST_EPSILON) {
                nx = COINCIDENT_AXIS_X;
                ny = COINCIDENT_AXIS_Y;
                dist = 0;
            } else {
                nx = dx / dist;
                ny = dy / dist;
            }

            const overlap = a.radius + b.radius - dist;
            if (overlap <= CROWD_SPACING_OVERLAP_EPSILON) continue;

            if (roleA === 'soft' && roleB === 'soft') {
                const wA = getCrowdSpacingWeight(a);
                const wB = getCrowdSpacingWeight(b);
                const wSum = wA + wB;
                if (!(wSum > 0)) continue;
                // Inverse-weight split: heavier unit moves less.
                const moveA = overlap * (wB / wSum);
                const moveB = overlap * (wA / wSum);
                addDelta(idA, -nx * moveA, -ny * moveA);
                addDelta(idB, nx * moveB, ny * moveB);
            } else if (roleA === 'soft' && roleB === 'anchor') {
                addDelta(idA, -nx * overlap, -ny * overlap);
            } else if (roleA === 'anchor' && roleB === 'soft') {
                addDelta(idB, nx * overlap, ny * overlap);
            }
        }
    }

    for (const id of sortedIds) {
        const delta = deltas.get(id);
        if (!delta) continue;
        if (delta.x === 0 && delta.y === 0) continue;

        const unit = byId.get(id)!;
        if (getCrowdSpacingRole(unit) !== 'soft') continue;

        const clamped = clampNudgeVectorToTerrain(
            unit,
            delta,
            terrainManager,
            terrainGrid ?? null,
        );
        if (clamped.x === 0 && clamped.y === 0) continue;

        unit.x += clamped.x;
        unit.y += clamped.y;
        grid.updateUnit(unit.id, unit.x, unit.y, unit.radius);
    }
}
