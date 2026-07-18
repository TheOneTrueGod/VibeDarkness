/**
 * Shared graph-search primitives over `MapNetworkManager`'s node/edge graph. Lives here (not
 * `unitAI/utils.ts`) because both an AI tree (`nh_travel.ts`) and a non-AI nest-tick module
 * (`game/lanternite/swarmNestTick.ts`) need it.
 */

import type { MapNetworkManager } from './MapNetworkManager';

/**
 * Resolve the node a world position "is at": the node containing it, or — when the position is
 * out on an edge between nodes, or the graph has no containing node — the node closest to it by
 * straight-line distance. Returns `null` only when the graph has no nodes at all.
 */
export function resolveNearestNodeId(
    x: number,
    y: number,
    mapNetwork: Pick<MapNetworkManager, 'findNodeContainingPosition' | 'getAllNodeIds' | 'getNode'>,
): string | null {
    const contained = mapNetwork.findNodeContainingPosition(x, y);
    if (contained) return contained.id;

    let bestId: string | null = null;
    let bestDistSq = Infinity;
    for (const nodeId of mapNetwork.getAllNodeIds()) {
        const node = mapNetwork.getNode(nodeId);
        if (!node) continue;
        const dx = node.x - x;
        const dy = node.y - y;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestId = nodeId;
        }
    }
    return bestId;
}

/**
 * Breadth-first shortest path (by edge count) from `fromId` to `toId`, inclusive of both ends.
 * Returns `null` when unreachable.
 */
export function findNodePath(
    mapNetwork: Pick<MapNetworkManager, 'getNeighborIds'>,
    fromId: string,
    toId: string,
): string[] | null {
    if (fromId === toId) return [fromId];
    const prev = new Map<string, string>();
    const visited = new Set<string>([fromId]);
    const queue = [fromId];
    for (let head = 0; head < queue.length; head++) {
        const current = queue[head]!;
        if (current === toId) break;
        for (const neighborId of mapNetwork.getNeighborIds(current)) {
            if (visited.has(neighborId)) continue;
            visited.add(neighborId);
            prev.set(neighborId, current);
            queue.push(neighborId);
        }
    }
    if (!visited.has(toId)) return null;

    const path: string[] = [toId];
    let current = toId;
    while (current !== fromId) {
        const parent = prev.get(current);
        if (!parent) return null;
        path.push(parent);
        current = parent;
    }
    return path.reverse();
}

/**
 * Single breadth-first-search pass outward from `fromId`. Returns the first node id (in
 * non-decreasing hop-distance order, `fromId` itself tested first at hop 0) for which `predicate`
 * is true, or `null` if no reachable node satisfies it.
 */
export function findNearestNodeByHops(
    mapNetwork: Pick<MapNetworkManager, 'getNeighborIds'>,
    fromId: string,
    predicate: (nodeId: string) => boolean,
): string | null {
    if (predicate(fromId)) return fromId;
    const visited = new Set<string>([fromId]);
    const queue = [fromId];
    for (let head = 0; head < queue.length; head++) {
        const current = queue[head]!;
        for (const neighborId of mapNetwork.getNeighborIds(current)) {
            if (visited.has(neighborId)) continue;
            visited.add(neighborId);
            if (predicate(neighborId)) return neighborId;
            queue.push(neighborId);
        }
    }
    return null;
}
