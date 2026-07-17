import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerSegment, getMissionSegmentNetwork } from './segmentRegistry';
import type { MapSegmentData } from './segmentSchema';
import { TerrainType } from './TerrainType';
import { registerWorldOfDarknessSegments } from '../storylines/WorldOfDarkness/registerSegments';

const _ = TerrainType.Grass;

function makeTerrain(width: number, height: number): TerrainType[][] {
    return Array.from({ length: height }, () => Array<TerrainType>(width).fill(_));
}

describe('getMissionSegmentNetwork', () => {
    beforeEach(() => {
        // Segment A: origin segment (gridCol 0, gridRow 0), holds a gridPoint node ("nodeA") and
        // edges to "nodeB" (cross-segment, valid) and "nodeUnknown" (no such node — must be
        // dropped with a warn).
        const segA: MapSegmentData = {
            id: 'net_test_seg_a',
            gridCol: 0,
            gridRow: 0,
            width: 10,
            height: 10,
            terrain: makeTerrain(10, 10),
            pointsOfInterest: [],
            zones: [],
            network: {
                nodes: [
                    {
                        id: 'nodeA',
                        position: { kind: 'gridPoint', col: 2, row: 3 },
                        radius: 1,
                        tags: ['nest'],
                    },
                ],
                edges: [
                    ['nodeA', 'nodeB'],
                    ['nodeA', 'nodeUnknown'],
                ],
            },
        };

        // Segment B: one column over (gridCol 1, gridRow 0), holds a pixelPoint node ("nodeB").
        const segB: MapSegmentData = {
            id: 'net_test_seg_b',
            gridCol: 1,
            gridRow: 0,
            width: 10,
            height: 10,
            terrain: makeTerrain(10, 10),
            pointsOfInterest: [],
            zones: [],
            network: {
                nodes: [{ id: 'nodeB', position: { kind: 'pixelPoint', x: 15, y: 25 } }],
                edges: [],
            },
        };

        registerSegment(segA);
        registerSegment(segB);
    });

    it('resolves gridPoint and pixelPoint nodes to mission-global pixel coords', () => {
        const { nodes } = getMissionSegmentNetwork(['net_test_seg_a', 'net_test_seg_b']);

        // originCol/originRow for segA = (0,0); CELL_SIZE = 40.
        const nodeA = nodes.find((n) => n.id === 'nodeA');
        expect(nodeA).toEqual({
            id: 'nodeA',
            x: (0 + 2) * 40 + 20,
            y: (0 + 3) * 40 + 20,
            radius: 1,
            tags: ['nest'],
            segmentId: 'net_test_seg_a',
        });

        // originCol for segB = (1 - 0) * 10 = 10, originRow = 0; pixelPoint adds raw offset.
        const nodeB = nodes.find((n) => n.id === 'nodeB');
        expect(nodeB).toEqual({
            id: 'nodeB',
            x: 10 * 40 + 15,
            y: 0 * 40 + 25,
            radius: 0,
            tags: [],
            segmentId: 'net_test_seg_b',
        });
    });

    it('resolves a valid cross-segment edge and drops an edge with an unknown node id', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const { edges } = getMissionSegmentNetwork(['net_test_seg_a', 'net_test_seg_b']);

        expect(edges).toEqual([['nodeA', 'nodeB']]);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('nodeA'),
        );

        warnSpy.mockRestore();
    });

    it('returns an empty network for an empty segmentIds list', () => {
        expect(getMissionSegmentNetwork([])).toEqual({ nodes: [], edges: [] });
    });

    it('skips unregistered segment ids without throwing', () => {
        const { nodes, edges } = getMissionSegmentNetwork(['does_not_exist']);
        expect(nodes).toEqual([]);
        expect(edges).toEqual([]);
    });
});

/**
 * Tripwire (plan Step 8): the real WorldOfDarkness segments used by `008_thorn_march.ts` must
 * carry real `network.nodes`/`network.edges` data — not just old-style `connects:` POI tags,
 * which `lanterniteNetworkUtils.ts` no longer reads (see Step 7). If this ever regresses back to
 * an empty graph, it degrades silently (no error, `mapNetwork.getNeighborIds(...)` just returns
 * `[]`) rather than crashing, so this test exists to fail loudly instead. Independent of
 * `008_thorn_march.test.ts`'s mission-integration pass/fail.
 */
describe('getMissionSegmentNetwork — real WorldOfDarkness thorn-march segments (tripwire)', () => {
    beforeEach(() => {
        registerWorldOfDarknessSegments();
    });

    it('produces a non-empty edge list connecting the real nest node ids', () => {
        const { nodes, edges } = getMissionSegmentNetwork([
            '49_51_west_glade',
            '49_52_thorn_path',
            '48_52_thorn_path_2',
        ]);

        const nodeIds = nodes.map((n) => n.id).sort();
        expect(nodeIds).toEqual(['nest_48_52', 'nest_49_51', 'nest_49_52']);

        expect(edges.length).toBeGreaterThan(0);
        const edgeSet = new Set(edges.map(([a, b]) => [a, b].sort().join('|')));
        expect(edgeSet.has(['nest_49_51', 'nest_49_52'].sort().join('|'))).toBe(true);
        expect(edgeSet.has(['nest_49_52', 'nest_48_52'].sort().join('|'))).toBe(true);
    });
});
