/**
 * Tracks the latest observed heartbeat values (host tick, paused-batch tick, and material change
 * detection). Updated from both `pollOnce` and `appendBattleOrder` responses.
 */
export class HeartbeatState {
    private latestHeartbeatHostTick = 0;
    /** Latest heartbeat parallel order batch (`orderBatchAtTick` / `pausedAtTick` when paused); not last-completed. */
    private latestHeartbeatPausedAtTick: number | null = null;
    /** Latest `hostFingerprint` from poll/append (for soft stale-batch recovery). */
    private latestHostFingerprint: string | null = null;
    /** Latest `expectingFromPlayerIds` from heartbeat (null = unknown / not paused). */
    private latestExpectingFromPlayerIds: string[] | null = null;
    /** Epoch ms when `latestHeartbeatHostTick` was last refreshed (poll or append response). */
    private latestHeartbeatObservedAtMs: number | null = null;
    /** Non-host: last `hostTick|hostFingerprint` when fingerprint was non-null (material identity for optimistic playahead). */
    private lastHeartbeatMaterialKey: string | null = null;
    /** Non-host: previous poll's `hostTick|hostFingerprint` differed from the prior stored key. */
    private lastPollHeartbeatMaterialChanged = false;

    getLatestHostTick(): number {
        return this.latestHeartbeatHostTick;
    }

    getLatestPausedAtTick(): number | null {
        return this.latestHeartbeatPausedAtTick;
    }

    setLatestPausedAtTick(value: number | null): void {
        this.latestHeartbeatPausedAtTick = value;
    }

    getLatestHostFingerprint(): string | null {
        return this.latestHostFingerprint;
    }

    setLatestHostFingerprint(value: string | null): void {
        this.latestHostFingerprint = value;
    }

    getLatestExpectingFromPlayerIds(): string[] | null {
        return this.latestExpectingFromPlayerIds;
    }

    setLatestExpectingFromPlayerIds(value: string[] | null): void {
        this.latestExpectingFromPlayerIds = value;
    }

    getLastObservedAtMs(): number | null {
        return this.latestHeartbeatObservedAtMs;
    }

    getLastHeartbeatAgeMs(): number | null {
        if (this.latestHeartbeatObservedAtMs == null) {
            return null;
        }
        return Math.max(0, Date.now() - this.latestHeartbeatObservedAtMs);
    }

    getMaterialKey(): string | null {
        return this.lastHeartbeatMaterialKey;
    }

    didLastPollChangeMaterial(): boolean {
        return this.lastPollHeartbeatMaterialChanged;
    }

    /**
     * Update {@link getMaterialKey} from a fresh heartbeat row and return whether the host tick +
     * fingerprint pair changed vs the prior observation.
     */
    observeMaterialChange(hostTick: number, hostFingerprint: string | null): boolean {
        const matKey =
            hostFingerprint != null && hostFingerprint !== ''
                ? `${hostTick}|${hostFingerprint}`
                : null;
        const prev = this.lastHeartbeatMaterialKey;
        const changed = matKey != null && prev != null && matKey !== prev;
        if (matKey != null) {
            this.lastHeartbeatMaterialKey = matKey;
        }
        this.lastPollHeartbeatMaterialChanged = changed;
        return changed;
    }

    clearLastPollMaterialChanged(): void {
        this.lastPollHeartbeatMaterialChanged = false;
    }

    /** Resync resets: clear the material identity tracking. */
    resetMaterialTracking(): void {
        this.lastHeartbeatMaterialKey = null;
        this.lastPollHeartbeatMaterialChanged = false;
    }

    updateLastSeenHeartbeat(hostTick: number): void {
        this.latestHeartbeatHostTick = hostTick;
        this.latestHeartbeatObservedAtMs = Date.now();
    }

    updateHeartbeatFromAppendResponse(res: {
        hostTick?: number;
        hostFingerprint?: string | null;
        orderBatchAtTick?: number | null;
        expectingFromPlayerIds?: string[] | null;
    }): void {
        if (typeof res.hostTick !== 'number' || Number.isNaN(res.hostTick)) {
            return;
        }
        if (res.hostTick < this.latestHeartbeatHostTick) {
            return;
        }
        this.updateLastSeenHeartbeat(res.hostTick);
        if (typeof res.hostFingerprint === 'string' && res.hostFingerprint !== '') {
            this.latestHostFingerprint = res.hostFingerprint;
        }
        if (typeof res.orderBatchAtTick === 'number' && !Number.isNaN(res.orderBatchAtTick)) {
            this.latestHeartbeatPausedAtTick = res.orderBatchAtTick;
        }
        if (res.expectingFromPlayerIds !== undefined) {
            this.latestExpectingFromPlayerIds = res.expectingFromPlayerIds;
        }
    }
}
