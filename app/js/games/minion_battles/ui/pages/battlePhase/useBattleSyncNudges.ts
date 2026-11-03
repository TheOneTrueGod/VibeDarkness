import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useWebRtcMesh } from '../../../../../contexts/WebRtcMeshContext';
import type { BattleNet, BattleSyncNudge } from '../../../game/battlenet';

/** WebRTC event type for {@link BattleSyncNudge}: "the server has something new, poll now". */
export const BATTLE_SYNC_NUDGE_EVENT = 'battle_sync_nudge';

/** Parses a peer event into a nudge, or null when malformed. */
export function parseBattleSyncNudge(event: Record<string, unknown>): BattleSyncNudge | null {
    const { kind, atTick } = event;
    if (kind !== 'order-appended' && kind !== 'batch-merged') return null;
    if (typeof atTick !== 'number' || !Number.isFinite(atTick)) return null;
    return { kind, atTick };
}

/**
 * Bridges {@link BattleNet} sync nudges over the WebRTC mesh. Returns a stable sender for
 * `createBattleNet({ sendSyncNudge })`; inbound nudges go to `netRef.current.handlePeerSyncNudge`.
 */
export function useBattleSyncNudges(netRef: RefObject<BattleNet | null>): (nudge: BattleSyncNudge) => void {
    const { sendTransientEvent, subscribePeerEvent } = useWebRtcMesh();
    const sendRef = useRef(sendTransientEvent);
    sendRef.current = sendTransientEvent;

    useEffect(
        () =>
            subscribePeerEvent(BATTLE_SYNC_NUDGE_EVENT, (fromPlayerId, event) => {
                const nudge = parseBattleSyncNudge(event);
                if (nudge) netRef.current?.handlePeerSyncNudge(fromPlayerId, nudge);
            }),
        [subscribePeerEvent, netRef],
    );

    return useCallback((nudge: BattleSyncNudge) => {
        sendRef.current({ type: BATTLE_SYNC_NUDGE_EVENT, transient: true, ...nudge });
    }, []);
}
