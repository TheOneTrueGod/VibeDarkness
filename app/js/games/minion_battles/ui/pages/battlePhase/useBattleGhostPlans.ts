import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { GHOST_PLAN_UPDATE_EVENT } from '../../../../../contexts/PeerStateStore';
import { useWebRtcMesh } from '../../../../../contexts/WebRtcMeshContext';
import type { BattleSession } from '../../../game/BattleSession';
import type { GhostPlanData } from '../../../game/types';
import {
    buildOutboundGhostPlan,
    hasOutboundGhostPlanChanged,
    ingestHeldGhostPlansFromPeers,
    resolveGhostPlansForRender,
} from '../../../game/interaction/ghostPlanRenderPolicy';

interface UseBattleGhostPlansParams {
    sessionRef: RefObject<BattleSession | null>;
    playerId: string;
    itsPreviewActive: boolean;
}

/** Outbound 100 ms ghost-plan builder + peer render policy for ITS rewind. */
export function useBattleGhostPlans({ sessionRef, playerId, itsPreviewActive }: UseBattleGhostPlansParams) {
    const { peerStatesByType, broadcastPeerState } = useWebRtcMesh();
    const ghostPlans = useMemo(() => {
        const states = peerStatesByType[GHOST_PLAN_UPDATE_EVENT] ?? {};
        return Object.fromEntries(
            Object.entries(states).map(([id, s]) => [id, (s.payload ?? null) as GhostPlanData | null]),
        );
    }, [peerStatesByType]);

    const heldGhostPlansRef = useRef<Record<string, GhostPlanData>>({});
    const [peerGhostPlansVisibleAfterRewind, setPeerGhostPlansVisibleAfterRewind] = useState(false);

    const renderGhostPlans = useMemo(() => {
        if (itsPreviewActive) {
            ingestHeldGhostPlansFromPeers(heldGhostPlansRef.current, ghostPlans, playerId);
        }
        return resolveGhostPlansForRender(ghostPlans, playerId, {
            itsPreviewActive,
            showPeerGhostsAfterRewind: peerGhostPlansVisibleAfterRewind,
            heldPeerGhosts: heldGhostPlansRef.current,
        });
    }, [ghostPlans, playerId, itsPreviewActive, peerGhostPlansVisibleAfterRewind]);

    const prevItsPreviewActiveRef = useRef(false);
    useEffect(() => {
        if (itsPreviewActive && !prevItsPreviewActiveRef.current) {
            heldGhostPlansRef.current = {};
            setPeerGhostPlansVisibleAfterRewind(false);
        }
        if (!itsPreviewActive) {
            heldGhostPlansRef.current = {};
            setPeerGhostPlansVisibleAfterRewind(false);
        }
        prevItsPreviewActiveRef.current = itsPreviewActive;
    }, [itsPreviewActive]);

    const lastSentGhostPlanRef = useRef<GhostPlanData | null>(null);
    useEffect(() => {
        const interval = setInterval(() => {
            const session = sessionRef.current;
            const its = session?.interactiveTargeting;
            const engine = session?.getEngine();
            const manager = session?.getInteractionManager();
            const uiState = manager?.getUIState();
            const itsWaitingForTarget =
                (its?.isActive ?? false) && (engine?.waitingForTargetInput ?? null) !== null;
            const newPlan = buildOutboundGhostPlan({
                itsActive: its?.isActive ?? false,
                itsUnitId: its?.isActive ? its.unitId : null,
                itsAbilityId: its?.isActive ? its.abilityId : null,
                itsCollectedTargets: its?.isActive ? Object.values(its.collectedTargets) : [],
                itsWaitingForTarget,
                uiState,
            });
            const prev = lastSentGhostPlanRef.current;
            if (hasOutboundGhostPlanChanged(prev, newPlan)) {
                lastSentGhostPlanRef.current = newPlan;
                broadcastPeerState(GHOST_PLAN_UPDATE_EVENT, newPlan, engine?.gameTick ?? null);
            }
        }, 100);
        return () => {
            clearInterval(interval);
            broadcastPeerState(GHOST_PLAN_UPDATE_EVENT, null, null);
        };
    }, [sessionRef, broadcastPeerState]);

    return {
        renderGhostPlans,
        setPeerGhostPlansVisibleAfterRewind,
    };
}
