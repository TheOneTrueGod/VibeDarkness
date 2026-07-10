/** Last-known inbound payload from a peer for a given event type. */
export interface ReceivedPeerState {
    payload: unknown;
    tick: number | null;
    receivedAtMs: number;
}

export interface OutboundPeerState {
    eventType: string;
    payload: unknown;
    tick: number | null;
}

/** Framework-free store for last peer state per (eventType, peerId). */
export class PeerStateStore {
    private readonly inboundByType = new Map<string, Map<string, ReceivedPeerState>>();
    private readonly outboundByType = new Map<string, { payload: unknown; tick: number | null }>();

    recordInbound(eventType: string, peerId: string, payload: unknown, tick: number | null, receivedAtMs: number): void {
        let peers = this.inboundByType.get(eventType);
        if (!peers) {
            peers = new Map();
            this.inboundByType.set(eventType, peers);
        }
        peers.set(peerId, { payload, tick, receivedAtMs });
    }

    /** Clears inbound state for a peer (null payload semantics for ghost plans). */
    clearPeer(peerId: string, receivedAtMs: number): void {
        for (const peers of this.inboundByType.values()) {
            if (peers.has(peerId)) {
                peers.set(peerId, { payload: null, tick: null, receivedAtMs });
            }
        }
    }

    recordOutbound(eventType: string, payload: unknown, tick: number | null): void {
        this.outboundByType.set(eventType, { payload, tick });
    }

    /** Non-null outbound states only — used to re-broadcast on peer connect. */
    getOutboundForResend(): OutboundPeerState[] {
        const result: OutboundPeerState[] = [];
        for (const [eventType, state] of this.outboundByType) {
            if (state.payload !== null) {
                result.push({ eventType, payload: state.payload, tick: state.tick });
            }
        }
        return result;
    }

    getPeerStates(eventType: string): Record<string, ReceivedPeerState> {
        const peers = this.inboundByType.get(eventType);
        if (!peers) return {};
        return Object.fromEntries(peers);
    }
}

export const GHOST_PLAN_UPDATE_EVENT = 'ghost_plan_update';
