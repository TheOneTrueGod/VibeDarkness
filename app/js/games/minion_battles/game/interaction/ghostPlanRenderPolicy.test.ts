import { describe, it, expect } from 'vitest';
import {
    ingestHeldGhostPlansFromPeers,
    resolveGhostPlansForRender,
} from './ghostPlanRenderPolicy';
import type { GhostPlanData } from '../types';

const PEER_PLAN: GhostPlanData = {
    unitId: 'unit_p2',
    abilityId: '0120',
    currentTargets: [],
    mouseWorld: { x: 10, y: 20 },
};

describe('ghostPlanRenderPolicy', () => {
    it('ingestHeldGhostPlansFromPeers stores peer plans and skips local + legacy sentinel', () => {
        const held: Record<string, GhostPlanData> = {};
        ingestHeldGhostPlansFromPeers(
            held,
            {
                p1: PEER_PLAN,
                p2: PEER_PLAN,
                p3: { ...PEER_PLAN, sequentialTargeting: true },
            },
            'p1',
        );
        expect(held).toEqual({ p2: PEER_PLAN });
    });

    it('resolveGhostPlansForRender passes through all peers when not in ITS', () => {
        const out = resolveGhostPlansForRender(
            { p1: null, p2: PEER_PLAN },
            'p1',
            { itsPreviewActive: false, showPeerGhostsAfterRewind: false, heldPeerGhosts: {} },
        );
        expect(out).toEqual({ p2: PEER_PLAN });
    });

    it('resolveGhostPlansForRender hides peers during ITS playahead', () => {
        const out = resolveGhostPlansForRender(
            { p2: PEER_PLAN },
            'p1',
            {
                itsPreviewActive: true,
                showPeerGhostsAfterRewind: false,
                heldPeerGhosts: { p2: PEER_PLAN },
            },
        );
        expect(out).toEqual({});
    });

    it('resolveGhostPlansForRender shows held peers after rewind within ITS', () => {
        const held = { p2: PEER_PLAN };
        const out = resolveGhostPlansForRender(
            { p2: { ...PEER_PLAN, mouseWorld: { x: 99, y: 99 } } },
            'p1',
            {
                itsPreviewActive: true,
                showPeerGhostsAfterRewind: true,
                heldPeerGhosts: held,
            },
        );
        expect(out).toEqual(held);
    });
});
