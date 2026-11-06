/**
 * Legacy CrowdSpacing resolver: one-pass soft radius packing with terrain-clamped instant
 * corrections. Role-based (exempt / soft / anchor); radius is the spacing weight.
 */

import type { Unit } from '../../units/Unit';
import type { TerrainGrid } from '../../../terrain/TerrainGrid';
import type { TerrainManager } from '../../../terrain/TerrainManager';
import type { CrowdSpacingResolveArgs, CrowdSpacingResolver } from '../CrowdSpacingResolver';
import type { CrowdSpacingGrid } from '../shared/CrowdSpacingGrid';
import { applyClampedCrowdSpacingDelta, type Vec2 } from '../shared/applyClampedDelta';
import {
    enumerateCrowdSpacingOverlaps,
    indexCrowdSpacingParticipants,
} from '../shared/enumerateOverlaps';
import {
    getCrowdSpacingRadius,
    getCrowdSpacingRole,
    getCrowdSpacingWeight,
} from './legacyRoles';

export type ResolveCrowdSpacingPassArgs = {
    /** Participants already in the grid (soft + anchor). Exempt units must not be included. */
    units: Iterable<Unit>;
    grid: CrowdSpacingGrid;
    terrainManager?: TerrainManager | null;
    /** Bedrock / passability grid when no TerrainManager is available. */
    terrainGrid?: TerrainGrid | null;
    /**
     * Called once per overlapping (soft–soft or soft–anchor) pair, in deterministic id order,
     * before any separation is applied. This is the "bump" signal other systems listen for.
     */
    onContact?: (a: Unit, b: Unit) => void;
};

/**
 * Single separation pass over unique overlapping pairs (unitId ascending).
 * Soft–soft: inverse-weight split of overlap depth. Soft–anchor: full correction on soft.
 * Anchor–anchor: no-op. Soft deltas are terrain-clamped before apply; grid cells refreshed.
 */
export function resolveCrowdSpacingPass(args: ResolveCrowdSpacingPassArgs): void {
    const { units, grid, terrainManager, terrainGrid, onContact } = args;

    const { byId, sortedIds } = indexCrowdSpacingParticipants(units);
    if (byId.size === 0) return;

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

    enumerateCrowdSpacingOverlaps({
        byId,
        sortedIds,
        grid,
        radius: getCrowdSpacingRadius,
        considerPair: (a, b) => {
            const roleA = getCrowdSpacingRole(a);
            const roleB = getCrowdSpacingRole(b);
            if (roleA === 'exempt' || roleB === 'exempt') return false;
            return !(roleA === 'anchor' && roleB === 'anchor');
        },
        visit: ({ a, b, nx, ny, overlap }) => {
            onContact?.(a, b);
            const roleA = getCrowdSpacingRole(a);
            const roleB = getCrowdSpacingRole(b);

            if (roleA === 'soft' && roleB === 'soft') {
                const wA = getCrowdSpacingWeight(a);
                const wB = getCrowdSpacingWeight(b);
                const wSum = wA + wB;
                if (!(wSum > 0)) return;
                // Inverse-weight split: heavier unit moves less.
                const moveA = overlap * (wB / wSum);
                const moveB = overlap * (wA / wSum);
                addDelta(a.id, -nx * moveA, -ny * moveA);
                addDelta(b.id, nx * moveB, ny * moveB);
            } else if (roleA === 'soft' && roleB === 'anchor') {
                addDelta(a.id, -nx * overlap, -ny * overlap);
            } else if (roleA === 'anchor' && roleB === 'soft') {
                addDelta(b.id, nx * overlap, ny * overlap);
            }
        },
    });

    for (const id of sortedIds) {
        const delta = deltas.get(id);
        if (!delta) continue;
        if (delta.x === 0 && delta.y === 0) continue;

        const unit = byId.get(id)!;
        if (getCrowdSpacingRole(unit) !== 'soft') continue;

        applyClampedCrowdSpacingDelta({
            unit,
            delta,
            grid,
            radius: getCrowdSpacingRadius(unit),
            terrainManager,
            terrainGrid,
        });
    }
}

/** {@link CrowdSpacingResolver} wrapper around {@link resolveCrowdSpacingPass}. */
export class LegacyResolver implements CrowdSpacingResolver {
    readonly mode = 'legacy' as const;

    isParticipant(unit: Unit): boolean {
        return getCrowdSpacingRole(unit) !== 'exempt';
    }

    radius(unit: Unit): number {
        return getCrowdSpacingRadius(unit);
    }

    resolve(args: CrowdSpacingResolveArgs): void {
        resolveCrowdSpacingPass({
            units: args.participants,
            grid: args.grid,
            terrainManager: args.terrainManager,
            onContact: args.onContact,
        });
    }
}
