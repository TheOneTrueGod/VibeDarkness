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
    entries: UserStateEntry[];
    debounceTimer: ReturnType<typeof setTimeout> | null;
}

const FLUSH_SIZE = 20;
const DEBOUNCE_MS = 5_000;

const buckets = new Map<string, QueueBucket>();

function bucketKey(lobbyId: string, userId: string): string {
    return `${lobbyId}::${userId}`;
}

async function flush(bucket: QueueBucket): Promise<void> {
    if (bucket.debounceTimer !== null) {
        clearTimeout(bucket.debounceTimer);
        bucket.debounceTimer = null;
    }
    if (bucket.entries.length === 0) {
        return;
    }
    const { key, entries } = bucket;
    bucket.entries = [];

    const url = `${key.baseUrl}/api/lobbies/${key.lobbyId}/user-state/${key.userId}`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ playerId: key.playerId, entries }),
        });
    } catch {
        // Silently swallow — user state logs are best-effort debug data.
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
        bucket = { key: { lobbyId, userId, playerId, baseUrl }, entries: [], debounceTimer: null };
        buckets.set(k, bucket);
    }
    bucket.entries.push(entry);

    if (bucket.entries.length >= FLUSH_SIZE) {
        void flush(bucket);
    } else {
        scheduleDebounce(bucket);
    }
}
