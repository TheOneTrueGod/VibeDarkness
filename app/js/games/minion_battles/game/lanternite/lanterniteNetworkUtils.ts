/**
 * Lanternite network utilities — POI graph helpers for nest-to-nest connectivity.
 *
 * Connections are declared via `connects:<poi_id>` tags on `nest` POIs and are bidirectional:
 * if A declares connects:B, the runtime also treats B as connected to A.
 */

import type { MapSegmentPOI } from '../../terrain/segmentSchema';
import type { Unit } from '../units/Unit';
import { LANTERNITE_NEST_CHARACTER_ID } from './lanternitePulse';

/** Collect all POI IDs connected to the given nest POI (bidirectional via `connects:` tags). */
export function getConnectedNestPoiIds(nestPoiId: string, allPois: readonly MapSegmentPOI[]): string[] {
    const connected: string[] = [];

    // Forward: tags on the source POI
    const sourcePoi = allPois.find((p) => p.id === nestPoiId && p.type === 'nest');
    for (const tag of sourcePoi?.tags ?? []) {
        if (tag.startsWith('connects:')) {
            const targetId = tag.slice('connects:'.length);
            if (targetId && !connected.includes(targetId)) connected.push(targetId);
        }
    }

    // Reverse: any nest POI that declares connects: to us
    for (const poi of allPois) {
        if (poi.type !== 'nest' || poi.id === nestPoiId) continue;
        for (const tag of poi.tags ?? []) {
            if (tag === `connects:${nestPoiId}` && !connected.includes(poi.id)) {
                connected.push(poi.id);
            }
        }
    }

    return connected;
}

/**
 * Find a connected nest POI that has no alive `lanternite_nest` unit claiming it
 * and no living scout already traveling toward it.
 */
export function findUnoccupiedConnectedNestPoi(
    nestPoiId: string,
    allPois: readonly MapSegmentPOI[],
    allUnits: readonly Unit[],
): MapSegmentPOI | null {
    const connectedIds = getConnectedNestPoiIds(nestPoiId, allPois);

    for (const connId of connectedIds) {
        const alreadyClaimed = allUnits.some(
            (u) =>
                u.isAlive() &&
                u.characterId === LANTERNITE_NEST_CHARACTER_ID &&
                u.lanterniteHomeNestPoiId === connId,
        );
        const alreadyTargeted = allUnits.some(
            (u) => u.isAlive() && u.lanterniteTargetNestPoiId === connId,
        );
        if (!alreadyClaimed && !alreadyTargeted) {
            const poi = allPois.find((p) => p.id === connId && p.type === 'nest');
            if (poi) return poi;
        }
    }

    return null;
}

/** Count alive children of a specific nest by role. */
export function countAliveChildrenByRole(
    spawnedIds: readonly string[],
    allUnits: readonly Unit[],
    role: 'scout' | 'defender',
): number {
    return spawnedIds.filter((id) => {
        const u = allUnits.find((x) => x.id === id);
        return u != null && u.isAlive() && u.lanterniteRole === role;
    }).length;
}
