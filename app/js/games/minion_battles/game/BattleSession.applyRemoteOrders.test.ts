/**
 * {@link BattleSession.applyRemoteOrders} dedupes by wire idHash or hashOrderId(playerId, atTick, order).
 */
import { afterAll, beforeAll, describe, it, expect, vi, afterEach } from 'vitest';
import type { MinionBattlesApi } from '../api/minionBattlesApi';
import type { PlayerState } from '../../../types';
import { BattleSession } from './BattleSession';
import type { BattleOrder } from './types';
import { OrderManager } from './managers/OrderManager';
import { hashOrderId } from './battlenet/helpers/orderHashing';

const FIXED_DT = 1 / 60;

beforeAll(() => {
    if (globalThis.requestAnimationFrame === undefined) {
        vi.stubGlobal(
            'requestAnimationFrame',
            (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number,
        );
        vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>));
    }
});

afterAll(() => {
    vi.unstubAllGlobals();
});

function makeApiStub(): MinionBattlesApi {
    return {
        setCurrentPlayerId: vi.fn(),
        sendMessage: vi.fn().mockResolvedValue({ messageId: 1 }),
    } as unknown as MinionBattlesApi;
}

async function mountSessionAtLocalPlayerTurn(): Promise<{ session: BattleSession; unitId: string }> {
    const session = new BattleSession({
        api: makeApiStub(),
        missionId: 'dark_awakening',
        playerId: 'p1',
        isHost: true,
    });
    const players: Record<string, PlayerState> = {
        p1: { id: 'p1', name: 'P1', color: '#fff' },
        p2: { id: 'p2', name: 'P2', color: '#000' },
    };
    const characterSelections = { p1: 'warrior', p2: 'ranger' };

    await session.load({
        players,
        characterSelections,
        battleSeed: 1,
    });
    const live = session.getEngine()!;
    live.stop();

    for (let i = 0; i < 400; i++) {
        (live as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
        const batch = live.waitingForOrders;
        if (batch?.waiters.some((w) => w.ownerId === 'p1')) {
            const unitId = live.state.orderMgr.getActiveOrderWaiterForPlayer('p1')?.unitId;
            if (unitId) return { session, unitId };
        }
    }
    throw new Error('expected engine to pause for p1');
}

function makeWaitOrder(unitId: string, moveCol: number, moveRow: number): BattleOrder {
    return {
        unitId,
        abilityId: 'wait',
        targets: [],
        movePath: [{ col: moveCol, row: moveRow }],
    };
}

describe('BattleSession.applyRemoteOrders', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('queues once when the same idHash is applied twice', async () => {
        const { session, unitId } = await mountSessionAtLocalPlayerTurn();
        const engine = session.getEngine()!;
        const unit = engine.getUnit(unitId);
        if (!unit) throw new Error('missing unit');
        const atTick = engine.waitingForOrders?.atTick;
        if (typeof atTick !== 'number') throw new Error('expected waitingForOrders.atTick');
        const col = Math.floor(unit.x / 40);
        const row = Math.floor(unit.y / 40);
        const order = makeWaitOrder(unitId, col + 1, row);

        const spy = vi.spyOn(OrderManager.prototype, 'queueOrder');
        session.applyRemoteOrders([
            { atTick, order, idHash: 'wire-dedupe-1', playerId: 'p2' },
            { atTick, order, idHash: 'wire-dedupe-1', playerId: 'p2' },
        ]);
        expect(spy).toHaveBeenCalledTimes(1);

        session.destroy();
    });

    it('queues once for two rows without idHash when playerId+tick+order match hashOrderId', async () => {
        const { session, unitId } = await mountSessionAtLocalPlayerTurn();
        const engine = session.getEngine()!;
        const unit = engine.getUnit(unitId);
        if (!unit) throw new Error('missing unit');
        const atTick = engine.waitingForOrders?.atTick;
        if (typeof atTick !== 'number') throw new Error('expected waitingForOrders.atTick');
        const col = Math.floor(unit.x / 40);
        const row = Math.floor(unit.y / 40);
        const order = makeWaitOrder(unitId, col + 2, row);
        const playerId = 'p2';

        const spy = vi.spyOn(OrderManager.prototype, 'queueOrder');
        session.applyRemoteOrders([{ atTick, order, playerId }]);
        session.applyRemoteOrders([{ atTick, order, playerId }]);
        expect(spy).toHaveBeenCalledTimes(1);
        const key = hashOrderId(playerId, atTick, order);
        const r2 = session.applyRemoteOrders([{ atTick, order, idHash: key, playerId }]);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(r2.skippedKeys).toContain(key);

        session.destroy();
    });

    it('skips applyRemoteOrders for idHashes pre-seeded via seedRemoteOrderDedupeKeys', async () => {
        const { session, unitId } = await mountSessionAtLocalPlayerTurn();
        const engine = session.getEngine()!;
        const atTick = engine.waitingForOrders?.atTick;
        if (typeof atTick !== 'number') throw new Error('expected waitingForOrders.atTick');
        const unit = engine.getUnit(unitId);
        if (!unit) throw new Error('missing unit');
        const col = Math.floor(unit.x / 40);
        const row = Math.floor(unit.y / 40);
        const order = makeWaitOrder(unitId, col + 1, row);

        const spy = vi.spyOn(OrderManager.prototype, 'queueOrder');
        session.seedRemoteOrderDedupeKeys(['pre-seeded']);
        const r = session.applyRemoteOrders([{ atTick, order, idHash: 'pre-seeded', playerId: 'p2' }]);
        expect(spy).not.toHaveBeenCalled();
        expect(r.newlyAppliedKeys).toEqual([]);
        expect(r.skippedKeys).toEqual(['pre-seeded']);

        session.destroy();
    });

    // Lobby 810373: loadFromSnapshot cleared the dedupe keys; a poll applied every historical order
    // (clamped to the checkpoint tick) before the async seedAppliedHashesForMergedOrdersThroughTick landed.
    it('host never re-applies orders at or before the loaded checkpoint tick, even before keys are seeded', async () => {
        const { session, unitId } = await mountSessionAtLocalPlayerTurn();
        const engine = session.getEngine()!;
        const checkpointTick = engine.gameTick;
        const nextBatchAtTick = engine.waitingForOrders?.atTick;
        if (typeof nextBatchAtTick !== 'number') throw new Error('expected waitingForOrders.atTick');
        const unit = engine.getUnit(unitId);
        if (!unit) throw new Error('missing unit');
        const col = Math.floor(unit.x / 40);
        const row = Math.floor(unit.y / 40);

        const store = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
            removeItem: (k: string) => void store.delete(k),
        });
        session.loadFromSnapshot(engine.toJSON(), { ordersBakedThroughTick: checkpointTick });
        session.getEngine()!.stop();

        const spy = vi.spyOn(OrderManager.prototype, 'queueOrder');
        const historical = makeWaitOrder(unitId, col + 1, row);
        const atCheckpoint = makeWaitOrder(unitId, col + 2, row);
        const r = session.applyRemoteOrders([
            { atTick: Math.max(0, checkpointTick - 50), order: historical, idHash: 'historical', playerId: 'p1' },
            { atTick: checkpointTick, order: atCheckpoint, idHash: 'at-checkpoint', playerId: 'p1' },
        ]);
        expect(spy).not.toHaveBeenCalled();
        expect(r.newlyAppliedKeys).toEqual([]);
        expect(r.skippedKeys).toEqual(['historical', 'at-checkpoint']);

        const next = session.applyRemoteOrders([
            { atTick: nextBatchAtTick, order: makeWaitOrder(unitId, col + 3, row), idHash: 'next', playerId: 'p1' },
        ]);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(next.newlyAppliedKeys).toEqual(['next']);

        session.destroy();
    });
});
