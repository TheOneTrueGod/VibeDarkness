/**
 * Tracks how long each lobby peer's WebRTC data channel has been open without a break.
 *
 * Peers nudge us over the mesh whenever the server gains something new (see `BattleSyncNudge`).
 * A nudge can only be missed while a channel is down, so "every peer linked since time T" means
 * every nudge sent after T reached us. {@link BattleNet} uses that to skip redundant forced polls.
 *
 * `update` is fed from the mesh's connection state (React), which reports a connect a little late
 * (conservative) and a drop a little late too (ICE needs a few seconds to call a silent link
 * failed). Callers must treat a "linked" answer as a hint backed by the regular poll, never as proof.
 */
export class PeerLinkTracker {
    /** Peer id → ms the current unbroken link opened, or null while down. */
    private readonly linkedSinceMs = new Map<string, number | null>();

    constructor(private readonly now: () => number = () => Date.now()) {}

    /** Sync to the lobby's other players and their current link state. Unknown peers count as down. */
    update(peerIds: readonly string[], connected: Readonly<Record<string, boolean>>): void {
        const wanted = new Set(peerIds);
        for (const id of [...this.linkedSinceMs.keys()]) {
            if (!wanted.has(id)) this.linkedSinceMs.delete(id);
        }
        const nowMs = this.now();
        let changed = false;
        for (const id of wanted) {
            const isUp = connected[id] === true;
            const since = this.linkedSinceMs.get(id) ?? null;
            if (isUp && since == null) {
                this.linkedSinceMs.set(id, nowMs);
                changed = true;
            } else if (!isUp) {
                if (since != null) changed = true;
                this.linkedSinceMs.set(id, null);
            }
        }
        if (changed) {
            for (const listener of [...this.listeners]) listener();
        }
    }

    /** True while `peerId`'s link is up right now (false for unknown peers). */
    isLinked(peerId: string): boolean {
        return (this.linkedSinceMs.get(peerId) ?? null) != null;
    }

    /** Called whenever a peer's link goes up or down. Returns an unsubscribe function. */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private readonly listeners = new Set<() => void>();

    /** True when every peer's link has been up without a break since `ms` (vacuously true with no peers). */
    allLinkedSince(ms: number): boolean {
        for (const since of this.linkedSinceMs.values()) {
            if (since == null || since > ms) return false;
        }
        return true;
    }
}
