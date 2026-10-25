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
import { LANTERNITE_NEST_CHARACTER_ID } from './lanternitePulse';
import { peekLanterniteState } from '../units/components/lanterniteComponent';

/**
 * Find a connected (neighbor) nest node the lanternite network has not claimed: no living
 * `lanternite_nest` already calls it home, and no living unit is already traveling toward it.
 *
 * Only the lanternite network's *own* claims exclude a node — a rival faction holding it (e.g. a
 * `swarm_nest`) does not. Scouts are meant to march on a contested site and fight for it
 * (`isNestSiteContested` in `lnet_scout_travel.ts` holds construction until the site is clear),
 * mirroring the swarm side's `findUnclaimedNetworkNode`. This deliberately does not use
 * `mapNetwork.getOwnerCharacterId`: that reports a rival-held node as "owned" (blocking expansion
 * forever) and a lanternite nest surrounded by its defenders as "contested" (unclaimed).
 */
export function findUnoccupiedConnectedNestPoi(
    nestPoiId: string,
    mapNetwork: Pick<MapNetworkManager, 'getNeighborIds' | 'getNode'>,
    allUnits: readonly Unit[],
): NetworkNode | null {
    const neighborIds = mapNetwork.getNeighborIds(nestPoiId);

    for (const neighborId of neighborIds) {
        const claimed = allUnits.some(
            (u) =>
                u.isAlive() &&
                (peekLanterniteState(u)?.targetNestPoiId === neighborId ||
                    (u.characterId === LANTERNITE_NEST_CHARACTER_ID &&
                        peekLanterniteState(u)?.homeNestPoiId === neighborId)),
        );
        if (claimed) continue;

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
        return u != null && u.isAlive() && peekLanterniteState(u)?.role === role;
    }).length;
}
