import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useWebRtcMesh } from '../../../../../contexts/WebRtcMeshContext';
import type { BattleNet, ReactionClaimMessage } from '../../../game/battlenet';

/** WebRTC event type for {@link ReactionClaimMessage} (co-op Reaction claim hints). */
export const REACTION_CLAIM_EVENT = 'reaction_claim';

/** Parses a peer event into a claim message, or null when malformed. */
export function parseReactionClaimMessage(event: Record<string, unknown>): ReactionClaimMessage | null {
    const { kind, planeId, atTick, unitId, accepted } = event;
    if (typeof planeId !== 'string' || typeof unitId !== 'string') return null;
    if (typeof atTick !== 'number' || !Number.isFinite(atTick)) return null;
    if (kind === 'reaction-claim-request') return { kind, planeId, atTick, unitId };
    if (kind === 'reaction-claim-result' && typeof accepted === 'boolean') {
        return { kind, planeId, atTick, unitId, accepted };
    }
    return null;
}

/**
 * Bridges co-op Reaction claim hints over the WebRTC mesh. Returns a stable sender for
 * `createBattleNet({ sendReactionClaimMessage })`; inbound messages go to
 * `netRef.current.handleReactionClaimMessage`. Hints only (see `ReactionClaimController`).
 */
export function useReactionClaimMessages(netRef: RefObject<BattleNet | null>): {
    sendReactionClaimMessage: (message: ReactionClaimMessage) => void;
} {
    const { sendTransientEvent, subscribePeerEvent } = useWebRtcMesh();
    const sendRef = useRef(sendTransientEvent);
    sendRef.current = sendTransientEvent;

    useEffect(
        () =>
            subscribePeerEvent(REACTION_CLAIM_EVENT, (fromPlayerId, event) => {
                const message = parseReactionClaimMessage(event);
                if (message) netRef.current?.handleReactionClaimMessage(fromPlayerId, message);
            }),
        [subscribePeerEvent, netRef],
    );

    const sendReactionClaimMessage = useCallback((message: ReactionClaimMessage) => {
        sendRef.current({ type: REACTION_CLAIM_EVENT, transient: true, ...message });
    }, []);
    return { sendReactionClaimMessage };
}
