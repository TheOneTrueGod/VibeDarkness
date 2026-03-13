export interface WebRtcLobbyMeshOptions {
    localPlayerId: string;
    /**
     * Called whenever we need to send a signaling message to another player.
     * The caller is responsible for delivering it via the HTTP message system.
     */
    sendSignal: (toPlayerId: string, signal: Record<string, unknown>) => void;
    /**
     * Called when a data message is received from a peer over WebRTC.
     */
    onPeerEvent?: (fromPlayerId: string, event: Record<string, unknown>) => void;
}

interface PeerEntry {
    pc: RTCPeerConnection;
    dataChannel: RTCDataChannel | null;
    pendingCandidates: RTCIceCandidateInit[];
}

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
];

/**
 * WebRtcLobbyMesh maintains a lightweight mesh of data channels between players in a lobby.
 * It relies on the existing HTTP message system for signaling (offer/answer/candidates).
 */
export class WebRtcLobbyMesh {
    private readonly localPlayerId: string;
    private readonly sendSignalFn: (toPlayerId: string, signal: Record<string, unknown>) => void;
    private readonly onPeerEvent?: (fromPlayerId: string, event: Record<string, unknown>) => void;
    private readonly peers: Map<string, PeerEntry> = new Map();

    constructor(options: WebRtcLobbyMeshOptions) {
        this.localPlayerId = options.localPlayerId;
        this.sendSignalFn = options.sendSignal;
        this.onPeerEvent = options.onPeerEvent;
    }

    /**
     * Ensure we have peer connections to the provided list of player IDs.
     * This is symmetric across clients; the lower playerId alphabetically
     * becomes the initiator (creates the offer).
     */
    updatePeers(allPlayerIds: string[]): void {
        const others = allPlayerIds.filter((id) => id !== this.localPlayerId);

        // Tear down connections to players that are no longer present
        for (const remoteId of Array.from(this.peers.keys())) {
            if (!others.includes(remoteId)) {
                this.closeConnection(remoteId);
            }
        }

        // Create connections where needed
        for (const remoteId of others) {
            if (this.peers.has(remoteId)) continue;
            const isInitiator = this.localPlayerId < remoteId;
            this.createConnection(remoteId, isInitiator).catch((err) => {
                console.warn('Failed to create WebRTC connection', remoteId, err);
            });
        }
    }

    /**
     * Handle an incoming signaling payload from another player.
     */
    async handleSignal(fromPlayerId: string, signal: Record<string, unknown>): Promise<void> {
        let entry = this.peers.get(fromPlayerId);
        if (!entry) {
            // Create a non-initiator connection if we don't have one yet.
            await this.createConnection(fromPlayerId, false);
            entry = this.peers.get(fromPlayerId) ?? null;
        }
        if (!entry) return;
        const { pc } = entry;

        const kind = String(signal.type ?? '');

        if (kind === 'offer') {
            const sdp = signal.sdp as RTCSessionDescriptionInit | undefined;
            if (!sdp) return;
            if (pc.signalingState !== 'stable') {
                return;
            }
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            this.sendSignalFn(fromPlayerId, { type: 'answer', sdp: answer });
        } else if (kind === 'answer') {
            const sdp = signal.sdp as RTCSessionDescriptionInit | undefined;
            if (!sdp) return;
            if (pc.signalingState === 'have-local-offer' || pc.signalingState === 'have-remote-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                // After remote description is set, flush any pending ICE candidates.
                if (entry.pendingCandidates.length > 0) {
                    const pending = [...entry.pendingCandidates];
                    entry.pendingCandidates = [];
                    for (const candidateInit of pending) {
                        try {
                            await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
                        } catch (err) {
                            console.warn('Error adding pending ICE candidate', err);
                        }
                    }
                }
            }
        } else if (kind === 'candidate') {
            const candidateInit = signal.candidate as RTCIceCandidateInit | undefined;
            if (!candidateInit || !candidateInit.candidate) return;
            try {
                // Some browsers may send candidates before we've applied the remote description.
                // In that case, buffer them and apply after setRemoteDescription succeeds.
                if (!pc.remoteDescription || pc.signalingState === 'closed') {
                    entry.pendingCandidates.push(candidateInit);
                    return;
                }
                await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
            } catch (err) {
                console.warn('Error adding ICE candidate', err);
            }
        }
    }

    /**
     * Broadcast an event to all currently connected peers.
     */
    sendEventToAll(event: Record<string, unknown>): void {
        const payload = JSON.stringify(event);
        for (const [remoteId, entry] of this.peers.entries()) {
            const channel = entry.dataChannel;
            if (!channel || channel.readyState !== 'open') continue;
            try {
                channel.send(payload);
            } catch (err) {
                console.warn('Failed to send data over WebRTC to', remoteId, err);
            }
        }
    }

    /**
     * Close all peer connections.
     */
    dispose(): void {
        for (const remoteId of Array.from(this.peers.keys())) {
            this.closeConnection(remoteId);
        }
        this.peers.clear();
    }

    private async createConnection(remoteId: string, isInitiator: boolean): Promise<void> {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        let dataChannel: RTCDataChannel | null = null;

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignalFn(remoteId, { type: 'candidate', candidate: event.candidate.toJSON() });
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
                this.closeConnection(remoteId);
            }
        };

        const setupChannel = (channel: RTCDataChannel) => {
            dataChannel = channel;
            channel.onmessage = (event) => {
                if (!this.onPeerEvent) return;
                try {
                    const parsed = JSON.parse(event.data) as Record<string, unknown>;
                    this.onPeerEvent(remoteId, parsed);
                } catch {
                    // Ignore malformed messages
                }
            };
        };

        if (isInitiator) {
            const channel = pc.createDataChannel('lobby');
            setupChannel(channel);
        } else {
            pc.ondatachannel = (ev) => {
                setupChannel(ev.channel);
            };
        }

        this.peers.set(remoteId, { pc, dataChannel, pendingCandidates: [] });

        if (isInitiator) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.sendSignalFn(remoteId, { type: 'offer', sdp: offer });
        }
    }

    private closeConnection(remoteId: string): void {
        const entry = this.peers.get(remoteId);
        if (!entry) return;
        try {
            entry.dataChannel?.close();
        } catch {
            // ignore
        }
        try {
            entry.pc.close();
        } catch {
            // ignore
        }
        this.peers.delete(remoteId);
    }
}

/**
 * Simple helper for manual testing from the browser console.
 * Example:
 *   window.__vibeTestWebRtcPing?.();
 */
export type WebRtcPingTestFn = () => void;

