import { describe, expect, it } from 'vitest';
import {
    HostPersistQueue,
    type HostPersistEnvelope,
    type HostPersistSendResult,
    type HostPersistWindow,
} from './HostPersistQueue';

const flush = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
};

function harness(window: HostPersistWindow = { hostTick: 100, orderBatchAtTick: 101 }) {
    const sent: HostPersistEnvelope[] = [];
    const pending: Array<(r: HostPersistSendResult) => void> = [];
    const win = { ...window };
    const q = new HostPersistQueue({
        send: (env) => {
            sent.push(env);
            return new Promise<HostPersistSendResult>((resolve) => pending.push(resolve));
        },
        getWindow: () => win,
    });
    const ackNext = async (res: HostPersistSendResult = { ok: true }): Promise<void> => {
        pending.shift()!(res);
        await flush();
    };
    return { q, sent, win, ackNext, pending };
}

const row = (idHash: string, atTick: number) => ({ idHash, atTick, order: { idHash } });

describe('HostPersistQueue', () => {
    it('dedupes the same idHash into one send', async () => {
        const { q, sent, ackNext } = harness();
        const a = q.enqueueOrder(row('w', 101));
        const b = q.enqueueOrder(row('w', 101));
        const c = q.enqueueOrder(row('w', 101));
        expect(b).toBe(a);
        expect(c).toBe(a);
        await flush();
        expect(sent).toHaveLength(1);
        expect(sent[0].orders).toHaveLength(1);
        await ackNext();
        await expect(a).resolves.toBe(true);
        expect(sent).toHaveLength(1);
    });

    it('coalesces rows queued during a send into one follow-up envelope', async () => {
        const { q, sent, ackNext } = harness();
        void q.enqueueOrder(row('a', 101));
        await flush();
        expect(sent).toHaveLength(1);
        for (const id of ['b', 'c', 'd', 'e', 'f']) void q.enqueueOrder(row(id, 101));
        await flush();
        expect(sent).toHaveLength(1);
        await ackNext();
        expect(sent).toHaveLength(2);
        expect(sent[1].orders.map((o) => o.idHash)).toEqual(['b', 'c', 'd', 'e', 'f']);
    });

    it('sends row 5299 before snapshot 5396 (7628CD shape)', async () => {
        const { q, sent, ackNext, win } = harness({ hostTick: 5298, orderBatchAtTick: 5299 });
        void q.enqueueSnapshot({ tick: 5396, payload: 'S', token: 't', orderBatchAtTick: null });
        void q.enqueueOrder(row('r', 5299));
        await flush();
        expect(sent).toHaveLength(1);
        expect(sent[0].snapshot).toBeNull();
        expect(sent[0].orders.map((o) => o.atTick)).toEqual([5299]);
        win.hostTick = 5299;
        await ackNext();
        expect(sent).toHaveLength(2);
        expect(sent[1].snapshot?.tick).toBe(5396);
        expect(sent[1].orders).toHaveLength(0);
    });

    it('keeps a row outside the window queued until the window updates', async () => {
        const { q, sent, win } = harness({ hostTick: 100, orderBatchAtTick: null });
        void q.enqueueOrder(row('far', 500));
        await flush();
        expect(sent).toHaveLength(0);
        expect(q.getDepth()).toBe(1);
        win.hostTick = 499;
        q.notifyWindowChanged();
        await flush();
        expect(sent).toHaveLength(1);
    });

    it('dropOrders removes queued rows (resolving false) and unblocks a snapshot behind them', async () => {
        const { q, sent, win } = harness({ hostTick: 100, orderBatchAtTick: null });
        const stale = q.enqueueOrder(row('stale', 500));
        void q.enqueueSnapshot({ tick: 600, payload: {}, token: null });
        await flush();
        expect(sent).toHaveLength(0);
        win.hostTick = 700;
        const dropped = q.dropOrders((o) => o.atTick <= win.hostTick);
        expect(dropped.map((o) => o.idHash)).toEqual(['stale']);
        await expect(stale).resolves.toBe(false);
        await flush();
        expect(sent).toHaveLength(1);
        expect(sent[0].snapshot?.tick).toBe(600);
    });

    it('depth counts queued + in flight and returns to 0', async () => {
        const { q, ackNext } = harness();
        const changes: number[] = [];
        q.onChange(() => changes.push(q.getDepth()));
        void q.enqueueOrder(row('a', 101));
        void q.enqueueOrder(row('b', 101));
        expect(q.getDepth()).toBe(2);
        await flush();
        expect(q.getDepth()).toBe(2);
        await ackNext();
        expect(q.getDepth()).toBe(0);
        expect(changes[changes.length - 1]).toBe(0);
    });

    it('resolves false for server-rejected rows and clear() drops everything', async () => {
        const { q, ackNext } = harness();
        const a = q.enqueueOrder(row('a', 101));
        const b = q.enqueueOrder(row('b', 101));
        await flush();
        await ackNext({ ok: true, rejectedIdHashes: ['b'] });
        await expect(a).resolves.toBe(true);
        await expect(b).resolves.toBe(false);
        const c = q.enqueueOrder(row('c', 500));
        q.clear();
        await expect(c).resolves.toBe(false);
        expect(q.getDepth()).toBe(0);
    });
});
