import type { SerializedGameState, OrderAtTick } from '../types';

export interface UserStateEntry {
    tick: number;
    game_state: SerializedGameState;
    orders: OrderAtTick[];
    fp?: string;
}

interface QueueKey {
    lobbyId: string;
    userId: string;
    playerId: string;
    baseUrl: string;
}

interface QueueBucket {
    key: QueueKey;
    /** Entries pre-serialized to JSON so the batch's byte size is known before sending. */
    entries: string[];
    bytes: number;
    debounceTimer: ReturnType<typeof setTimeout> | null;
    inFlight: boolean;
}

const FLUSH_SIZE = 20;
/**
 * Flush once a batch passes this many bytes of JSON. Each entry carries a full serialized game state
 * (hundreds of KB on big maps); PHP's json_decode of a 20-entry batch blows its 128MB memory limit
 * and the request 500s. A single oversized entry is still sent on its own.
 */
const FLUSH_BYTES = 2 * 1024 * 1024;
const DEBOUNCE_MS = 5_000;

const buckets = new Map<string, QueueBucket>();

function bucketKey(lobbyId: string, userId: string): string {
    return `${lobbyId}::${userId}`;
}

let uploadHold: (() => boolean) | null = null;

/**
 * While `isHeld()` is true, debug user-state uploads do not POST (game saves have priority).
 * Pass null to clear. Returns an unregister function that only clears this hold if it is still current.
 */
export function setUserStateUploadHold(isHeld: (() => boolean) | null): () => void {
    uploadHold = isHeld;
    return () => {
        if (uploadHold === isHeld) {
            uploadHold = null;
        }
    };
}

function isUploadHeld(): boolean {
    return uploadHold !== null && uploadHold();
}

/** Test helper: drop all buckets, timers and the hold. */
export function resetUserStateQueueForTests(): void {
    for (const bucket of buckets.values()) {
        if (bucket.debounceTimer !== null) {
            clearTimeout(bucket.debounceTimer);
        }
    }
    buckets.clear();
    uploadHold = null;
}

async function flush(bucket: QueueBucket): Promise<void> {
    if (bucket.debounceTimer !== null) {
        clearTimeout(bucket.debounceTimer);
        bucket.debounceTimer = null;
    }
    if (bucket.entries.length === 0) {
        return;
    }
    // One user-state POST in flight per bucket: the batch waits and is re-flushed when it finishes.
    if (bucket.inFlight) {
        return;
    }
    if (isUploadHeld()) {
        scheduleDebounce(bucket);
        return;
    }
    const { key, entries } = bucket;
    bucket.entries = [];
    bucket.bytes = 0;
    bucket.inFlight = true;

    const url = `${key.baseUrl}/api/lobbies/${key.lobbyId}/user-state/${key.userId}`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: `{"playerId":${JSON.stringify(key.playerId)},"entries":[${entries.join(',')}]}`,
        });
    } catch {
        // Silently swallow — user state logs are best-effort debug data.
    } finally {
        bucket.inFlight = false;
    }
    if (bucket.entries.length > 0) {
        if (bucket.bytes >= FLUSH_BYTES || bucket.entries.length >= FLUSH_SIZE) {
            void flush(bucket);
        } else {
            scheduleDebounce(bucket);
        }
    }
}

function scheduleDebounce(bucket: QueueBucket): void {
    if (bucket.debounceTimer !== null) {
        return;
    }
    bucket.debounceTimer = setTimeout(() => {
        bucket.debounceTimer = null;
        void flush(bucket);
    }, DEBOUNCE_MS);
}

export function enqueueUserState(
    lobbyId: string,
    userId: string,
    playerId: string,
    baseUrl: string,
    entry: UserStateEntry,
): void {
    const k = bucketKey(lobbyId, userId);
    let bucket = buckets.get(k);
    if (!bucket) {
        bucket = { key: { lobbyId, userId, playerId, baseUrl }, entries: [], bytes: 0, debounceTimer: null, inFlight: false };
        buckets.set(k, bucket);
    }
    const encoded = JSON.stringify(entry);
    if (bucket.entries.length > 0 && bucket.bytes + encoded.length > FLUSH_BYTES) {
        if (bucket.inFlight || isUploadHeld()) {
            // Cannot send now: keep at most one pending batch and drop the oldest entries (best-effort debug data).
            let dropped = 0;
            while (bucket.entries.length > 0 && bucket.bytes + encoded.length > FLUSH_BYTES) {
                bucket.bytes -= bucket.entries.shift()!.length;
                dropped++;
            }
            console.warn(`[userStateBatchQueue] dropped ${dropped} oldest user-state entries while uploads are held`);
        } else {
            void flush(bucket);
        }
    }
    bucket.entries.push(encoded);
    bucket.bytes += encoded.length;

    if (bucket.entries.length >= FLUSH_SIZE || bucket.bytes >= FLUSH_BYTES) {
        void flush(bucket);
    } else {
        scheduleDebounce(bucket);
    }
}
