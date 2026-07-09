import { describe, it, expect } from 'vitest';
import {
    buildOutboundGhostPlan,
    hasOutboundGhostPlanChanged,
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

describe('buildOutboundGhostPlan', () => {
    it('broadcasts ITS cursor while paused at a select step', () => {
        const plan = buildOutboundGhostPlan({
            itsActive: true,
            itsUnitId: 'u1',
            itsAbilityId: '0116',
            itsCollectedTargets: [],
            itsWaitingForTarget: true,
            uiState: {
                selectedAbility: null,
                selectedCardIndex: null,
                nonconfirmedOrder: null,
                currentTargets: [],
                mouseWorld: { x: 50, y: 60 },
                previewOrderUnitId: null,
            },
        });
        expect(plan).toEqual({
            unitId: 'u1',
            abilityId: '0116',
            currentTargets: [],
            mouseWorld: { x: 50, y: 60 },
        });
    });

    it('suppresses ITS ghost during playahead between target picks', () => {
        expect(
            buildOutboundGhostPlan({
                itsActive: true,
                itsUnitId: 'u1',
                itsAbilityId: '0116',
                itsCollectedTargets: [{ type: 'unit', unitId: 'e1' }],
                itsWaitingForTarget: false,
                uiState: { mouseWorld: { x: 1, y: 2 } } as never,
            }),
        ).toBeNull();
    });

    it('uses AbilityTargetingTool ui state when ITS is inactive', () => {
        const plan = buildOutboundGhostPlan({
            itsActive: false,
            itsUnitId: null,
            itsAbilityId: null,
            itsCollectedTargets: [],
            itsWaitingForTarget: false,
            uiState: {
                selectedAbility: { id: '0120' } as never,
                selectedCardIndex: 0,
                nonconfirmedOrder: null,
                currentTargets: [],
                mouseWorld: { x: 3, y: 4 },
                previewOrderUnitId: 'u1',
            },
        });
        expect(plan?.abilityId).toBe('0120');
        expect(plan?.mouseWorld).toEqual({ x: 3, y: 4 });
    });
});

describe('hasOutboundGhostPlanChanged', () => {
    it('detects mouse movement', () => {
        const base = { ...PEER_PLAN };
        expect(hasOutboundGhostPlanChanged(base, { ...base, mouseWorld: { x: 11, y: 20 } })).toBe(true);
        expect(hasOutboundGhostPlanChanged(base, { ...base })).toBe(false);
    });
});

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
