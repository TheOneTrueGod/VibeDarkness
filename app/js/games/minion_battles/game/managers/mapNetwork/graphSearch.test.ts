import { describe, it, expect } from 'vitest';
import { MapNetworkManager } from './MapNetworkManager';
import { resolveNearestNodeId, findNodePath, findNearestNodeByHops } from './graphSearch';
import type { ResolvedMapNetwork } from './types';

// Chain: a - b - c, with 'd' disconnected.
const network: ResolvedMapNetwork = {
    nodes: [
        { id: 'a', x: 0, y: 0, radius: 5, tags: [], segmentId: 'seg1' },
        { id: 'b', x: 100, y: 0, radius: 5, tags: [], segmentId: 'seg1' },
        { id: 'c', x: 200, y: 0, radius: 5, tags: [], segmentId: 'seg1' },
        { id: 'd', x: 500, y: 500, radius: 5, tags: [], segmentId: 'seg2' },
    ],
    edges: [
        ['a', 'b'],
        ['b', 'c'],
    ],
};

function makeManager(): MapNetworkManager {
    const mgr = new MapNetworkManager();
    mgr.loadFromSegments(network);
    return mgr;
}

describe('resolveNearestNodeId', () => {
    it('returns the node containing the position', () => {
        const mgr = makeManager();
        expect(resolveNearestNodeId(1, 1, mgr)).toBe('a');
    });

    it('falls back to nearest-by-distance when outside every node radius', () => {
        const mgr = makeManager();
        // (90, 0) is outside every radius-5 node, but closest to 'b' (100,0).
        expect(resolveNearestNodeId(90, 0, mgr)).toBe('b');
    });

    it('returns null for an empty graph', () => {
        const mgr = new MapNetworkManager();
        mgr.loadFromSegments({ nodes: [], edges: [] });
        expect(resolveNearestNodeId(0, 0, mgr)).toBeNull();
    });
});

describe('findNodePath', () => {
    it('returns a single-element path when fromId === toId', () => {
        const mgr = makeManager();
        expect(findNodePath(mgr, 'a', 'a')).toEqual(['a']);
    });

    it('finds the shortest path across multiple hops', () => {
        const mgr = makeManager();
        expect(findNodePath(mgr, 'a', 'c')).toEqual(['a', 'b', 'c']);
    });

    it('returns null when unreachable', () => {
        const mgr = makeManager();
        expect(findNodePath(mgr, 'a', 'd')).toBeNull();
    });
});

describe('findNearestNodeByHops', () => {
    it('returns fromId immediately if it already satisfies the predicate', () => {
        const mgr = makeManager();
        expect(findNearestNodeByHops(mgr, 'a', (id) => id === 'a')).toBe('a');
    });

    it('finds the nearest match by hop count outward from fromId', () => {
        const mgr = makeManager();
        expect(findNearestNodeByHops(mgr, 'a', (id) => id === 'c')).toBe('c');
    });

    it('returns null when no reachable node satisfies the predicate', () => {
        const mgr = makeManager();
        expect(findNearestNodeByHops(mgr, 'a', (id) => id === 'd')).toBeNull();
    });

    it('returns null on an isolated node with no matching neighbors', () => {
        const mgr = makeManager();
        expect(findNearestNodeByHops(mgr, 'd', (id) => id === 'a')).toBeNull();
    });
});
