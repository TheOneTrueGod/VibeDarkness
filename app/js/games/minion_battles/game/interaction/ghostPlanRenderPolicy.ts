import type { GhostPlanData, ResolvedTarget } from '../types';
import type { PlayerInteractionUIState } from './InteractionTool';

/** Inputs for building the local player's outbound ghost plan (WebRTC broadcast). */
export interface OutboundGhostPlanInputs {
    itsActive: boolean;
    itsUnitId: string | null;
    itsAbilityId: string | null;
    itsCollectedTargets: ResolvedTarget[];
    /** True when ITS is paused at a select-target step (not during playahead between picks). */
    itsWaitingForTarget: boolean;
    uiState: PlayerInteractionUIState | null | undefined;
}

/**
 * Build the ghost plan this client should broadcast. During ITS playahead between target picks,
 * returns null so peers do not see preview-sim positions. While paused at a select step, broadcasts
 * cursor + collected targets like the legacy AbilityTargetingTool path.
 */
export function buildOutboundGhostPlan(inputs: OutboundGhostPlanInputs): GhostPlanData | null {
    if (inputs.itsActive) {
        if (!inputs.itsWaitingForTarget || !inputs.itsUnitId || !inputs.itsAbilityId) {
            return null;
        }
        return {
            unitId: inputs.itsUnitId,
            abilityId: inputs.itsAbilityId,
            currentTargets: [...inputs.itsCollectedTargets],
            mouseWorld: { ...(inputs.uiState?.mouseWorld ?? { x: 0, y: 0 }) },
        };
    }

    const uiState = inputs.uiState;
    if (uiState?.selectedAbility && uiState?.previewOrderUnitId) {
        return {
            unitId: uiState.previewOrderUnitId,
            abilityId: uiState.selectedAbility.id,
            currentTargets: [...uiState.currentTargets],
            mouseWorld: { ...uiState.mouseWorld },
        };
    }
    if (uiState?.nonconfirmedOrder) {
        return {
            unitId: uiState.nonconfirmedOrder.unitId,
            abilityId: uiState.nonconfirmedOrder.abilityId,
            currentTargets: uiState.nonconfirmedOrder.targets,
            mouseWorld: uiState.nonconfirmedOrder.targets[0]?.position ?? { x: 0, y: 0 },
        };
    }
    return null;
}

/** Shallow compare for the 100ms ghost-plan broadcast interval. */
export function hasOutboundGhostPlanChanged(
    prev: GhostPlanData | null,
    next: GhostPlanData | null,
): boolean {
    if (next === null) {
        return prev !== null;
    }
    if (prev === null) {
        return true;
    }
    return (
        next.unitId !== prev.unitId ||
        next.abilityId !== prev.abilityId ||
        next.mouseWorld.x !== prev.mouseWorld.x ||
        next.mouseWorld.y !== prev.mouseWorld.y ||
        next.currentTargets.length !== prev.currentTargets.length
    );
}

/** Legacy ITS sentinel — ignore for hold/render (no longer broadcast). */
export function isLegacySequentialTargetingSentinel(plan: GhostPlanData | null | undefined): boolean {
    return plan?.sequentialTargeting === true;
}

/** Copy latest peer ghost plans into the local hold buffer while in ITS preview. */
export function ingestHeldGhostPlansFromPeers(
    held: Record<string, GhostPlanData>,
    ghostPlans: Record<string, GhostPlanData | null>,
    localPlayerId: string,
): void {
    for (const [pid, plan] of Object.entries(ghostPlans)) {
        if (pid === localPlayerId || plan == null || isLegacySequentialTargetingSentinel(plan)) {
            continue;
        }
        held[pid] = plan;
    }
}

export interface GhostPlanRenderPolicy {
    itsPreviewActive: boolean;
    showPeerGhostsAfterRewind: boolean;
    heldPeerGhosts: Record<string, GhostPlanData>;
}

/**
 * Ghost plans passed to the canvas / timeline. During local ITS playahead, peer ghosts are
 * hidden (they do not match preview sim); after rewind they are shown from the hold buffer.
 */
export function resolveGhostPlansForRender(
    ghostPlans: Record<string, GhostPlanData | null>,
    localPlayerId: string,
    policy: GhostPlanRenderPolicy,
): Record<string, GhostPlanData> {
    if (!policy.itsPreviewActive) {
        return Object.fromEntries(
            Object.entries(ghostPlans).filter(
                (entry): entry is [string, GhostPlanData] =>
                    entry[1] != null && !isLegacySequentialTargetingSentinel(entry[1]),
            ),
        );
    }
    if (policy.showPeerGhostsAfterRewind) {
        return { ...policy.heldPeerGhosts };
    }
    return {};
}
