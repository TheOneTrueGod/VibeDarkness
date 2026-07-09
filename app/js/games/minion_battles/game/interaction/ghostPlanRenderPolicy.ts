import type { GhostPlanData } from '../types';

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
