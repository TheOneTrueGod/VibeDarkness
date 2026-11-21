import { BATTLE_NET_MAX_DEFERRED_ORDERS } from './constants';
import { isAppendAtTickAccepted, maxAllowedAppendTick } from './hostPersistWindow';

/** Server accept window the queue consults before sending an order row. */
export interface HostPersistWindow {
    hostTick: number;
    orderBatchAtTick: number | null;
}

export interface HostPersistOrderItem<TOrder = unknown> {
    kind: 'order';
    idHash: string;
    atTick: number;
    order: TOrder;
}

export interface HostPersistSnapshotItem<TPayload = unknown, TToken = unknown> {
    kind: 'snapshot';
    tick: number;
    payload: TPayload;
    token: TToken;
    /** `waitingForOrders.atTick` carried by the snapshot (widens the window rows may ride in). */
    orderBatchAtTick?: number | null;
}

export type HostPersistItem<TOrder = unknown, TPayload = unknown, TToken = unknown> =
    | HostPersistOrderItem<TOrder>
    | HostPersistSnapshotItem<TPayload, TToken>;

/** One HTTP save: at most one snapshot plus the rows its window accepts. */
export interface HostPersistEnvelope<TOrder = unknown, TPayload = unknown, TToken = unknown> {
    snapshot: HostPersistSnapshotItem<TPayload, TToken> | null;
    orders: HostPersistOrderItem<TOrder>[];
}

export interface HostPersistSendResult {
    /** False means the whole envelope was rejected / failed. */
    ok: boolean;
    /** Order idHashes the server rejected even though the call itself succeeded. */
    rejectedIdHashes?: readonly string[];
}

export interface HostPersistQueueOptions<TOrder, TPayload, TToken> {
    send: (envelope: HostPersistEnvelope<TOrder, TPayload, TToken>) => Promise<HostPersistSendResult>;
    getWindow: () => HostPersistWindow;
    now?: () => number;
    maxOrdersPerEnvelope?: number;
}

interface Entry<TOrder, TPayload, TToken> {
    item: HostPersistItem<TOrder, TPayload, TToken>;
    enqueuedAt: number;
    promise: Promise<boolean>;
    resolve: (ok: boolean) => void;
}

function itemTick(item: HostPersistItem<unknown, unknown, unknown>): number {
    return item.kind === 'order' ? item.atTick : item.tick;
}

/**
 * Serial, deduplicated host save pipe. One send in flight; items go out in causal tick order
 * (an order row with `atTick <= S.tick` always precedes snapshot S, in an earlier envelope).
 * Owns no HTTP: callers inject `send` and a window provider.
 */
export class HostPersistQueue<TOrder = unknown, TPayload = unknown, TToken = unknown> {
    private queue: Entry<TOrder, TPayload, TToken>[] = [];
    private inFlight: Entry<TOrder, TPayload, TToken>[] = [];
    private orderEntries = new Map<string, Entry<TOrder, TPayload, TToken>>();
    private listeners = new Set<() => void>();
    private pumpScheduled = false;
    private sending = false;
    private generation = 0;
    private readonly send: HostPersistQueueOptions<TOrder, TPayload, TToken>['send'];
    private readonly getWindow: () => HostPersistWindow;
    private readonly now: () => number;
    private readonly maxOrders: number;

    constructor(opts: HostPersistQueueOptions<TOrder, TPayload, TToken>) {
        this.send = opts.send;
        this.getWindow = opts.getWindow;
        this.now = opts.now ?? ((): number => Date.now());
        this.maxOrders = opts.maxOrdersPerEnvelope ?? BATTLE_NET_MAX_DEFERRED_ORDERS;
    }

    /** Resolves true on ack, false on final rejection. Duplicate idHashes share the first promise. */
    enqueueOrder(item: Omit<HostPersistOrderItem<TOrder>, 'kind'>): Promise<boolean> {
        const existing = this.orderEntries.get(item.idHash);
        if (existing) return existing.promise;
        const entry = this.makeEntry({ kind: 'order', ...item });
        this.orderEntries.set(item.idHash, entry);
        this.insert(entry);
        this.changed();
        this.schedulePump();
        return entry.promise;
    }

    /**
     * Replaces an older queued snapshot only when no queued order sits between the two ticks.
     * A replaced snapshot's promise follows the replacement's outcome.
     */
    enqueueSnapshot(item: Omit<HostPersistSnapshotItem<TPayload, TToken>, 'kind'>): Promise<boolean> {
        const entry = this.makeEntry({ kind: 'snapshot', ...item });
        const idx = this.queue.findIndex((e) => e.item.kind === 'snapshot');
        if (idx >= 0) {
            const old = this.queue[idx];
            const oldTick = itemTick(old.item);
            const blocked = this.queue.some(
                (e) => e.item.kind === 'order' && e.item.atTick > oldTick && e.item.atTick <= item.tick,
            );
            if (!blocked && item.tick >= oldTick) {
                this.queue.splice(idx, 1);
                void entry.promise.then(old.resolve);
            }
        }
        this.insert(entry);
        this.changed();
        this.schedulePump();
        return entry.promise;
    }

    getDepth(): number {
        return this.queue.length + this.inFlight.length;
    }

    getOldestUnackedAgeMs(now: number = this.now()): number {
        let oldest = Infinity;
        for (const e of this.queue) oldest = Math.min(oldest, e.enqueuedAt);
        for (const e of this.inFlight) oldest = Math.min(oldest, e.enqueuedAt);
        return oldest === Infinity ? 0 : Math.max(0, now - oldest);
    }

    /** Fired on every depth change. Returns an unsubscribe. */
    onChange(cb: () => void): () => void {
        this.listeners.add(cb);
        return () => {
            this.listeners.delete(cb);
        };
    }

    /** Call after the accept window moved (heartbeat / snapshot ack) so deferred rows can go. */
    notifyWindowChanged(): void {
        this.schedulePump();
    }

    /**
     * Drops queued (not in-flight) order rows matching `pred` and resolves them false. For rows the
     * server can never accept (host tail moved past them) so they do not block snapshots behind them.
     */
    dropOrders(pred: (item: HostPersistOrderItem<TOrder>) => boolean): HostPersistOrderItem<TOrder>[] {
        const dropped: Entry<TOrder, TPayload, TToken>[] = [];
        this.queue = this.queue.filter((e) => {
            if (e.item.kind === 'order' && pred(e.item)) {
                dropped.push(e);
                return false;
            }
            return true;
        });
        for (const e of dropped) {
            this.orderEntries.delete((e.item as HostPersistOrderItem<TOrder>).idHash);
            e.resolve(false);
        }
        if (dropped.length > 0) {
            this.changed();
            this.schedulePump();
        }
        return dropped.map((e) => e.item as HostPersistOrderItem<TOrder>);
    }

    /** Recovery entry: drops everything queued and ignores any in-flight result. */
    clear(): void {
        this.generation++;
        const dropped = [...this.queue, ...this.inFlight];
        this.queue = [];
        this.inFlight = [];
        this.orderEntries.clear();
        this.sending = false;
        for (const e of dropped) e.resolve(false);
        if (dropped.length > 0) this.changed();
    }

    private makeEntry(item: HostPersistItem<TOrder, TPayload, TToken>): Entry<TOrder, TPayload, TToken> {
        let resolve!: (ok: boolean) => void;
        const promise = new Promise<boolean>((r) => {
            resolve = r;
        });
        return { item, enqueuedAt: this.now(), promise, resolve };
    }

    /** Keep tick order; at equal ticks orders precede snapshots; stable otherwise. */
    private insert(entry: Entry<TOrder, TPayload, TToken>): void {
        const rank = (e: Entry<TOrder, TPayload, TToken>): number => (e.item.kind === 'order' ? 0 : 1);
        const t = itemTick(entry.item);
        let i = this.queue.length;
        while (i > 0) {
            const prev = this.queue[i - 1];
            const pt = itemTick(prev.item);
            if (pt < t || (pt === t && rank(prev) <= rank(entry))) break;
            i--;
        }
        this.queue.splice(i, 0, entry);
    }

    private changed(): void {
        for (const cb of [...this.listeners]) cb();
    }

    private schedulePump(): void {
        if (this.pumpScheduled) return;
        this.pumpScheduled = true;
        queueMicrotask(() => {
            this.pumpScheduled = false;
            this.pump();
        });
    }

    private buildEnvelope(): Entry<TOrder, TPayload, TToken>[] {
        const win = this.getWindow();
        const snapIdx = this.queue.findIndex((e) => e.item.kind === 'snapshot');
        const picked: Entry<TOrder, TPayload, TToken>[] = [];

        // Rows ahead of the first snapshot go out first, in their own envelope, on the current window.
        const preEnd = snapIdx < 0 ? this.queue.length : snapIdx;
        for (let i = 0; i < preEnd && picked.length < this.maxOrders; i++) {
            const it = this.queue[i].item as HostPersistOrderItem<TOrder>;
            if (!isAppendAtTickAccepted(it.atTick, win.hostTick, win.orderBatchAtTick)) break;
            picked.push(this.queue[i]);
        }
        if (picked.length > 0 || snapIdx < 0) return picked;
        // Head row not accepted yet: stay queued so snapshot never overtakes it.
        if (preEnd > 0) return picked;

        // Snapshot at head: rows accepted by the window the snapshot establishes ride along.
        picked.push(this.queue[0]);
        const s = this.queue[0].item as HostPersistSnapshotItem<TPayload, TToken>;
        const ceiling = maxAllowedAppendTick(s.tick, s.orderBatchAtTick ?? null);
        let orderCount = 0;
        for (let i = 1; i < this.queue.length && orderCount < this.maxOrders; i++) {
            const it = this.queue[i].item;
            if (it.kind !== 'order') break;
            if (it.atTick <= s.tick || it.atTick > ceiling) break;
            picked.push(this.queue[i]);
            orderCount++;
        }
        return picked;
    }

    private pump(): void {
        if (this.sending || this.queue.length === 0) return;
        const picked = this.buildEnvelope();
        if (picked.length === 0) return;
        const gen = this.generation;
        this.queue = this.queue.filter((e) => !picked.includes(e));
        this.inFlight = picked;
        this.sending = true;
        const snapEntry = picked.find((e) => e.item.kind === 'snapshot');
        const envelope: HostPersistEnvelope<TOrder, TPayload, TToken> = {
            snapshot: snapEntry ? (snapEntry.item as HostPersistSnapshotItem<TPayload, TToken>) : null,
            orders: picked
                .filter((e) => e.item.kind === 'order')
                .map((e) => e.item as HostPersistOrderItem<TOrder>),
        };
        // Depth is unchanged here (queued -> in flight), so no change event.
        let result: Promise<HostPersistSendResult>;
        try {
            result = this.send(envelope);
        } catch {
            result = Promise.resolve({ ok: false });
        }
        void result
            .catch((): HostPersistSendResult => ({ ok: false }))
            .then((res) => {
                if (gen !== this.generation) return;
                const rejected = new Set(res.rejectedIdHashes ?? []);
                const done = this.inFlight;
                this.inFlight = [];
                this.sending = false;
                for (const e of done) {
                    if (e.item.kind === 'order') this.orderEntries.delete(e.item.idHash);
                    e.resolve(res.ok && !(e.item.kind === 'order' && rejected.has(e.item.idHash)));
                }
                this.changed();
                this.schedulePump();
            });
    }
}
