import { describe, it, expect } from 'vitest';
import { MapNetworkManager } from './MapNetworkManager';
import { Unit } from '../../units/Unit';
import type { ResolvedMapNetwork } from './types';

function makeUnit(id: string, x: number, y: number, characterId: string): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 10,
        maxHp: 10,
        speed: 1,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId,
        name: characterId,
    });
}

const network: ResolvedMapNetwork = {
    nodes: [
        { id: 'a', x: 0, y: 0, radius: 5, tags: [], segmentId: 'seg1' },
        { id: 'b', x: 100, y: 0, radius: 5, tags: [], segmentId: 'seg1' },
        { id: 'c', x: 200, y: 0, radius: 5, tags: [], segmentId: 'seg2' },
    ],
    edges: [['a', 'b']],
};

describe('MapNetworkManager', () => {
    describe('loadFromSegments', () => {
        it('populates nodes, edges, and adjacency', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            expect(mgr.getAllNodeIds().sort()).toEqual(['a', 'b', 'c']);
            expect(mgr.getNeighborIds('a')).toEqual(['b']);
            expect(mgr.getNeighborIds('b')).toEqual(['a']);
        });

        it('supports a disconnected node (no edges)', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            expect(mgr.getNeighborIds('c')).toEqual([]);
            expect(mgr.getNeighborNodes('c')).toEqual([]);
        });

        it('drops a dangling edge referencing an unknown node id', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments({
                nodes: [{ id: 'a', x: 0, y: 0, radius: 5, tags: [], segmentId: 'seg1' }],
                edges: [['a', 'missing']],
            });
            expect(mgr.getNeighborIds('a')).toEqual([]);
        });

        it('is idempotent and safe with empty input', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            mgr.loadFromSegments({ nodes: [], edges: [] });
            expect(mgr.getAllNodeIds()).toEqual([]);
            expect(mgr.getNode('a')).toBeUndefined();
        });
    });

    describe('buildInitialMembership', () => {
        it('assigns a unit to the node containing its position', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            const u1 = makeUnit('u1', 1, 1, 'lanternite');
            mgr.buildInitialMembership([u1]);
            expect(mgr.getUnitIdsInNode('a')).toEqual(['u1']);
            expect(mgr.findNodeForUnit('u1')?.id).toBe('a');
        });

        it('reassigns a unit to a new node when it moves', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            const u1 = makeUnit('u1', 1, 1, 'lanternite');
            mgr.buildInitialMembership([u1]);
            expect(mgr.findNodeForUnit('u1')?.id).toBe('a');

            u1.x = 100;
            u1.y = 1;
            mgr.buildInitialMembership([u1]);
            expect(mgr.findNodeForUnit('u1')?.id).toBe('b');
            expect(mgr.getUnitIdsInNode('a')).toEqual([]);
        });

        it('removes membership once a unit dies', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            const u1 = makeUnit('u1', 1, 1, 'lanternite');
            mgr.buildInitialMembership([u1]);
            expect(mgr.getUnitIdsInNode('a')).toEqual(['u1']);

            u1.hp = 0;
            mgr.buildInitialMembership([u1]);
            expect(mgr.getUnitIdsInNode('a')).toEqual([]);
            expect(mgr.findNodeForUnit('u1')).toBeUndefined();
        });

        it('leaves a unit unassigned when outside every node radius', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            const u1 = makeUnit('u1', 1000, 1000, 'lanternite');
            mgr.buildInitialMembership([u1]);
            expect(mgr.findNodeForUnit('u1')).toBeUndefined();
        });

        it('never assigns a unit whose def does not opt into the network, even inside a node radius', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            // 'slime' does not set participatesInMapNetwork — must stay invisible to the network.
            const u1 = makeUnit('u1', 1, 1, 'slime');
            mgr.buildInitialMembership([u1]);
            expect(mgr.getUnitIdsInNode('a')).toEqual([]);
            expect(mgr.findNodeForUnit('u1')).toBeUndefined();
        });
    });

    describe('updateUnitNode / unregisterUnit', () => {
        it('assigns a unit on first call', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            const u1 = makeUnit('u1', 1, 1, 'lanternite');
            mgr.updateUnitNode(u1);
            expect(mgr.getUnitIdsInNode('a')).toEqual(['u1']);
            expect(mgr.findNodeForUnit('u1')?.id).toBe('a');
        });

        it('reassigns a unit when it moves to a different node, removing it from the old one', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            const u1 = makeUnit('u1', 1, 1, 'lanternite');
            mgr.updateUnitNode(u1);
            expect(mgr.findNodeForUnit('u1')?.id).toBe('a');

            u1.x = 100;
            u1.y = 1;
            mgr.updateUnitNode(u1);
            expect(mgr.findNodeForUnit('u1')?.id).toBe('b');
            expect(mgr.getUnitIdsInNode('a')).toEqual([]);
        });

        it('is a no-op when the unit stays in the same node', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            const u1 = makeUnit('u1', 1, 1, 'lanternite');
            mgr.updateUnitNode(u1);
            const nodeA = mgr.getNode('a');
            const arrayRefBefore = nodeA?.unitIds;
            u1.x = 2;
            mgr.updateUnitNode(u1);
            expect(mgr.getNode('a')?.unitIds).toBe(arrayRefBefore);
            expect(mgr.getUnitIdsInNode('a')).toEqual(['u1']);
        });

        it('unregisters a dead unit and does not re-add it', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            const u1 = makeUnit('u1', 1, 1, 'lanternite');
            mgr.updateUnitNode(u1);
            expect(mgr.getUnitIdsInNode('a')).toEqual(['u1']);

            u1.hp = 0;
            mgr.updateUnitNode(u1);
            expect(mgr.getUnitIdsInNode('a')).toEqual([]);
            expect(mgr.findNodeForUnit('u1')).toBeUndefined();
        });

        it('never assigns a unit whose def does not opt into the network', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            const u1 = makeUnit('u1', 1, 1, 'slime');
            mgr.updateUnitNode(u1);
            expect(mgr.getUnitIdsInNode('a')).toEqual([]);
            expect(mgr.findNodeForUnit('u1')).toBeUndefined();
        });

        it('unregisterUnit removes a cached unit and is safe to call twice / on an unknown id', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            const u1 = makeUnit('u1', 1, 1, 'lanternite');
            mgr.updateUnitNode(u1);
            expect(mgr.getUnitIdsInNode('a')).toEqual(['u1']);

            mgr.unregisterUnit('u1');
            expect(mgr.getUnitIdsInNode('a')).toEqual([]);
            expect(() => mgr.unregisterUnit('u1')).not.toThrow();
            expect(() => mgr.unregisterUnit('never_registered')).not.toThrow();
        });

        it('loadFromSegments clears the node cache so a stale unit id does not leak into the new graph', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            const u1 = makeUnit('u1', 1, 1, 'lanternite');
            mgr.updateUnitNode(u1);
            expect(mgr.getUnitIdsInNode('a')).toEqual(['u1']);

            mgr.loadFromSegments(network);
            // Fresh graph: node 'a' exists again but with empty membership until re-synced.
            expect(mgr.getUnitIdsInNode('a')).toEqual([]);
            expect(mgr.findNodeForUnit('u1')).toBeUndefined();
        });
    });

    describe('getUnitCountsByCharacterId / getOwnerCharacterId', () => {
        it('tallies unit counts by characterId', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            const u1 = makeUnit('u1', 1, 1, 'lanternite');
            const u2 = makeUnit('u2', 2, 2, 'lanternite');
            const u3 = makeUnit('u3', -1, -1, 'lanternite_nest');
            mgr.buildInitialMembership([u1, u2, u3]);

            const counts = mgr.getUnitCountsByCharacterId('a', [u1, u2, u3]);
            expect(counts.get('lanternite')).toBe(2);
            expect(counts.get('lanternite_nest')).toBe(1);
        });

        it('returns undefined ownership for an empty node', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            expect(mgr.getOwnerCharacterId('a', [])).toBeUndefined();
        });

        it('returns undefined ownership for a node contested by two characterIds', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            const u1 = makeUnit('u1', 1, 1, 'lanternite');
            const u2 = makeUnit('u2', 2, 2, 'lanternite_nest');
            mgr.buildInitialMembership([u1, u2]);
            expect(mgr.getOwnerCharacterId('a', [u1, u2])).toBeUndefined();
        });

        it('returns the sole characterId for an uncontested node', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments(network);
            const u1 = makeUnit('u1', 1, 1, 'lanternite');
            mgr.buildInitialMembership([u1]);
            expect(mgr.getOwnerCharacterId('a', [u1])).toBe('lanternite');
        });
    });

    describe('findNodeContainingPosition overlap tie-break', () => {
        it('picks the closest-center node when two node radii overlap the point', () => {
            const mgr = new MapNetworkManager();
            mgr.loadFromSegments({
                nodes: [
                    { id: 'near', x: 0, y: 0, radius: 10, tags: [], segmentId: 'seg1' },
                    { id: 'far', x: 8, y: 0, radius: 10, tags: [], segmentId: 'seg1' },
                ],
                edges: [],
            });
            // (3, 0) is inside both radius-10 circles: distance 3 from 'near', distance 5 from 'far'.
            const node = mgr.findNodeContainingPosition(3, 0);
            expect(node?.id).toBe('near');
        });
    });
});
