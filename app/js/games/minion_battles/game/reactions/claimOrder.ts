/**
 * Wire shape of a recorded co-op Reaction claim (Step 15).
 *
 * A claim rides the SAME order stream the engine replays (`pending_orders` -> `applied_orders`), as an order row whose
 * `order.reactionClaim` is set. It is never an ordinary order: the sync layer routes it to
 * `OrderManager.queueReactionClaim` (-> `applyReactionClaim`), not `queueOrder`, so it cannot replace the claimant's
 * real answer row (the server's overlay key also separates the two, see `BattleStorage::orderOverlayKey`).
 */
import type { BattleOrder } from '../types';

export const REACTION_CLAIM_ABILITY_ID = 'reaction_claim';

export interface ReactionClaimOrder {
    unitId: string;
    abilityId: typeof REACTION_CLAIM_ABILITY_ID;
    targets: [];
    endTurn: false;
    reactionClaim: { planeId: string };
}

export function buildReactionClaimOrder(planeId: string, unitId: string): ReactionClaimOrder {
    return {
        unitId,
        abilityId: REACTION_CLAIM_ABILITY_ID,
        targets: [],
        endTurn: false,
        reactionClaim: { planeId },
    };
}

/** The claim a wire order carries, or null for any ordinary order. */
export function reactionClaimOf(
    order: BattleOrder | Record<string, unknown>,
): { planeId: string; unitId: string } | null {
    const claim = (order as { reactionClaim?: { planeId?: unknown } }).reactionClaim;
    const unitId = (order as { unitId?: unknown }).unitId;
    if (!claim || typeof claim.planeId !== 'string' || typeof unitId !== 'string') return null;
    return { planeId: claim.planeId, unitId };
}
