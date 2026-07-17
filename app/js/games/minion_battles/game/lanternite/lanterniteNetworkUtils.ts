/**
 * Lanternite network utilities — nest-to-nest connectivity queries built on `MapNetworkManager`.
 *
 * Connectivity is defined by the map network graph (`MapNetworkManager`), populated at mission
 * init from segment `network.nodes`/`network.edges` data (see `getMissionSegmentNetwork`). This
 * file no longer parses `connects:<poi_id>` POI tags itself — that logic moved into the manager.
 */

import type { MapNetworkManager } from '../managers/mapNetwork/MapNetworkManager';
import type { NetworkNode } from '../managers/mapNetwork/types';
import type { Unit } from '../units/Unit';

/**
 * Find a connected (neighbor) nest node with no owning `characterId` (per
 * `mapNetwork.getOwnerCharacterId` — position/radius-based node membership) and no living unit
 * already traveling toward it. The "targeting" check stays unit-state-based
 * (`lanterniteState.targetNestPoiId`) rather than a manager query — "targeting" is unit-local
 * intent, not a node occupancy fact the manager tracks.
 */
export function findUnoccupiedConnectedNestPoi(
    nestPoiId: string,
    mapNetwork: Pick<MapNetworkManager, 'getNeighborIds' | 'getOwnerCharacterId' | 'getNode'>,
    allUnits: readonly Unit[],
): NetworkNode | null {
    const neighborIds = mapNetwork.getNeighborIds(nestPoiId);

    for (const neighborId of neighborIds) {
        const owner = mapNetwork.getOwnerCharacterId(neighborId, allUnits);
        if (owner != null) continue;

        const alreadyTargeted = allUnits.some(
            (u) => u.isAlive() && u.lanterniteState.targetNestPoiId === neighborId,
        );
        if (alreadyTargeted) continue;

        const node = mapNetwork.getNode(neighborId);
        if (node) return node;
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
        return u != null && u.isAlive() && u.lanterniteState.role === role;
    }).length;
}
