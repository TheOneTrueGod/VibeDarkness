import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useWebRtcMesh } from '../../../../../contexts/WebRtcMeshContext';
import {
    BATTLE_SYNC_NUDGE_KINDS,
    PeerLinkTracker,
    type BattleNet,
    type BattleSyncNudge,
    type BattleSyncNudgeKind,
} from '../../../game/battlenet';

/** WebRTC event type for {@link BattleSyncNudge}: "the server has something new, poll now". */
export const BATTLE_SYNC_NUDGE_EVENT = 'battle_sync_nudge';

/** Parses a peer event into a nudge, or null when malformed. */
export function parseBattleSyncNudge(event: Record<string, unknown>): BattleSyncNudge | null {
    const { kind, atTick } = event;
    if (!BATTLE_SYNC_NUDGE_KINDS.includes(kind as BattleSyncNudgeKind)) return null;
    if (typeof atTick !== 'number' || !Number.isFinite(atTick)) return null;
    return { kind: kind as BattleSyncNudgeKind, atTick };
}

/**
 * Bridges {@link BattleNet} sync nudges over the WebRTC mesh. Returns a stable sender for
 * `createBattleNet({ sendSyncNudge })` and a stable {@link PeerLinkTracker} for
 * `createBattleNet({ peerLinks })`, kept in step with the mesh's link state for `peerIds`.
 * Inbound nudges go to `netRef.current.handlePeerSyncNudge`.
 */
export function useBattleSyncNudges(
    netRef: RefObject<BattleNet | null>,
    peerIds: readonly string[],
): { sendSyncNudge: (nudge: BattleSyncNudge) => void; peerLinks: PeerLinkTracker } {
    const { sendTransientEvent, subscribePeerEvent, peerConnected } = useWebRtcMesh();
    const sendRef = useRef(sendTransientEvent);
    sendRef.current = sendTransientEvent;
    const peerLinksRef = useRef<PeerLinkTracker | null>(null);
    peerLinksRef.current ??= new PeerLinkTracker();
    const peerLinks = peerLinksRef.current;

    const peerIdsKey = peerIds.join('|');
    useEffect(() => {
        peerLinks.update(peerIdsKey === '' ? [] : peerIdsKey.split('|'), peerConnected);
    }, [peerLinks, peerIdsKey, peerConnected]);

    useEffect(
        () =>
            subscribePeerEvent(BATTLE_SYNC_NUDGE_EVENT, (fromPlayerId, event) => {
                const nudge = parseBattleSyncNudge(event);
                if (nudge) netRef.current?.handlePeerSyncNudge(fromPlayerId, nudge);
            }),
        [subscribePeerEvent, netRef],
    );

    const sendSyncNudge = useCallback((nudge: BattleSyncNudge) => {
        sendRef.current({ type: BATTLE_SYNC_NUDGE_EVENT, transient: true, ...nudge });
    }, []);
    return { sendSyncNudge, peerLinks };
}
