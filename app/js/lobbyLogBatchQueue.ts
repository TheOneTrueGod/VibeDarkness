/**
 * Batches persisted lobby_log.jsonl POSTs (see `lobbyLog.ts`). Manual Debug Console
 * «Log local state» bypasses this queue via `manualLobbyLogPost` on `logToLobbyLog`.
 */
import type { AppendLobbyLogBody, LobbyClient } from './LobbyClient';

type QueueItem = {
    lobbyClient: LobbyClient;
    lobbyId: string;
    body: AppendLobbyLogBody;
};

const queue: QueueItem[] = [];
let flushInFlight = false;
let periodicTimer: ReturnType<typeof setInterval> | null = null;
let unloadHooksInstalled = false;

const FLUSH_INTERVAL_MS = 10_000;
const FLUSH_SIZE_THRESHOLD = 5;
const MAX_POST_RETRIES = 4;
const BASE_RETRY_MS = 250;
const MAX_LINES_PER_HTTP = 80;
/** Rough limit for `fetch(..., { keepalive: true })` bodies in Chromium. */
const KEEPALIVE_BODY_CHAR_BUDGET = 58_000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function ensurePeriodicFlush(): void {
    if (periodicTimer != null) {
        return;
    }
    periodicTimer = setInterval(() => {
        void flushQueuedLines('interval');
    }, FLUSH_INTERVAL_MS);
}

function stopPeriodicFlushIfIdle(): void {
    if (queue.length > 0 || periodicTimer == null) {
        return;
    }
    clearInterval(periodicTimer);
    periodicTimer = null;
}

function afterEnqueue(): void {
    ensurePeriodicFlush();
    if (queue.length >= FLUSH_SIZE_THRESHOLD) {
        void flushQueuedLines('size');
    }
}

function groupByLobby(items: QueueItem[]): Map<string, { lobbyClient: LobbyClient; bodies: AppendLobbyLogBody[] }> {
    const map = new Map<string, { lobbyClient: LobbyClient; bodies: AppendLobbyLogBody[] }>();
    for (const it of items) {
        const existing = map.get(it.lobbyId);
        if (existing) {
            existing.bodies.push(it.body);
        } else {
            map.set(it.lobbyId, { lobbyClient: it.lobbyClient, bodies: [it.body] });
        }
    }
    return map;
}

async function postOneChunkWithRetry(
    lobbyClient: LobbyClient,
    lobbyId: string,
    lines: AppendLobbyLogBody[],
): Promise<void> {
    const playerId = lines[0]?.playerId ?? '';
    for (let attempt = 0; attempt < MAX_POST_RETRIES; attempt++) {
        try {
            await lobbyClient.appendLobbyLogBatch(lobbyId, { playerId, lines });
            return;
        } catch {
            await sleep(BASE_RETRY_MS * 2 ** attempt);
        }
    }
    throw new Error('appendLobbyLogBatch failed after retries');
}

async function sendItems(items: QueueItem[]): Promise<void> {
    if (items.length === 0) {
        return;
    }
    const failedRequeue: QueueItem[] = [];
    const groups = groupByLobby(items);
    for (const [lobbyId, { lobbyClient, bodies }] of groups) {
        for (let i = 0; i < bodies.length; i += MAX_LINES_PER_HTTP) {
            const chunk = bodies.slice(i, i + MAX_LINES_PER_HTTP);
            try {
                await postOneChunkWithRetry(lobbyClient, lobbyId, chunk);
            } catch {
                for (const body of chunk) {
                    failedRequeue.push({ lobbyClient, lobbyId, body });
                }
            }
        }
    }
    if (failedRequeue.length > 0) {
        queue.unshift(...failedRequeue);
        ensurePeriodicFlush();
        setTimeout(() => {
            void flushQueuedLines('retry-backoff');
        }, 800);
    }
}

export async function flushQueuedLines(_source: string): Promise<void> {
    if (flushInFlight || queue.length === 0) {
        return;
    }
    flushInFlight = true;
    const batch = queue.splice(0, queue.length);
    try {
        await sendItems(batch);
    } finally {
        flushInFlight = false;
        stopPeriodicFlushIfIdle();
    }
}

export function enqueueBatchedLobbyLogLine(item: QueueItem): void {
    queue.push(item);
    afterEnqueue();
}

function fireUnloadFetch(lobbyClient: LobbyClient, lobbyId: string, playerId: string, lines: AppendLobbyLogBody[]): void {
    const url = `${lobbyClient.getBaseUrl()}/api/lobbies/${lobbyId}/lobby-log/batch`;
    const body = JSON.stringify({ playerId, lines });
    const init: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body,
    };
    if (body.length <= KEEPALIVE_BODY_CHAR_BUDGET) {
        void fetch(url, { ...init, keepalive: true });
    } else {
        void fetch(url, init);
    }
}

function flushOnPageLeave(): void {
    if (queue.length === 0) {
        return;
    }
    const snapshot = queue.splice(0, queue.length);
    if (periodicTimer != null) {
        clearInterval(periodicTimer);
        periodicTimer = null;
    }
    const groups = groupByLobby(snapshot);
    for (const [lobbyId, { lobbyClient, bodies }] of groups) {
        const playerId = bodies[0]?.playerId ?? '';
        for (let i = 0; i < bodies.length; i += MAX_LINES_PER_HTTP) {
            const chunk = bodies.slice(i, i + MAX_LINES_PER_HTTP);
            fireUnloadFetch(lobbyClient, lobbyId, playerId, chunk);
        }
    }
}

function installUnloadHooksOnce(): void {
    if (unloadHooksInstalled || typeof window === 'undefined') {
        return;
    }
    unloadHooksInstalled = true;
    window.addEventListener('pagehide', () => {
        flushOnPageLeave();
    });
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                flushOnPageLeave();
            }
        });
    }
}

installUnloadHooksOnce();

/** Test helper: drain the queue through the normal HTTP batch path. */
export async function flushLobbyLogBatchQueueForTests(): Promise<void> {
    await flushQueuedLines('test');
}

/** Test helper: clear queued lines and timers without sending. */
export function resetLobbyLogBatchQueueForTests(): void {
    queue.length = 0;
    if (periodicTimer != null) {
        clearInterval(periodicTimer);
        periodicTimer = null;
    }
}
