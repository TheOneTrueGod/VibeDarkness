/**
 * Tests for the held-remote-order dedupe contract in BattleSession +
 * InteractiveTargetingSession:
 *
 * (a) A row whose key is already in appliedRemoteOrderKeys is skipped at hold
 *     time — it is never held AND it is added to skippedKeys.
 * (b) A released row's key is registered in appliedRemoteOrderKeys, so a
 *     redelivered copy is skipped rather than double-applied.
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
        vi.stubGlobal('cancelAnimationFrame', (id: number) =>
            clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
        );
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

/**
 * Activate the InteractiveTargetingSession by seeding appliedRemoteOrderKeys with a key
 * that was already applied, then starting the ITS (using the p2 remote waiter order).
 *
 * Since USE_SEQUENTIAL_TARGETING controls begin(), we activate it directly via the
 * internal `interactiveTargeting` field when the flag is off, so the hold-path is always
 * exercised regardless of feature flag state.
 */
describe('BattleSession held-remote-order dedupe (finding 2)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('(a) a row whose key is already applied is skipped at hold time, not held', async () => {
        const { session, unitId } = await mountSessionAtLocalPlayerTurn();
        const engine = session.getEngine()!;
        const atTick = engine.waitingForOrders?.atTick;
        if (typeof atTick !== 'number') throw new Error('expected waitingForOrders.atTick');

        const unit = engine.getUnit(unitId);
        if (!unit) throw new Error('missing unit');
        const col = Math.floor(unit.x / 40);
        const row = Math.floor(unit.y / 40);
        const order = makeWaitOrder(unitId, col + 1, row);
        const playerId = 'p2';
        const key = hashOrderId(playerId, atTick, order);

        // Pre-seed the key as already applied.
        session.seedRemoteOrderDedupeKeys([key]);

        // Activate the ITS so applyRemoteOrders enters the hold branch.
        const its = session.interactiveTargeting;
        its['_isActive'] = true;

        expect(its.isActive).toBe(true);

        const spy = vi.spyOn(OrderManager.prototype, 'queueOrder');

        // Row with a key that was already applied before preview started.
        const result = session.applyRemoteOrders([{ atTick, order, idHash: key, playerId }]);

        // The key must appear in skippedKeys, not trigger a hold.
        expect(result.skippedKeys).toContain(key);
        // queueOrder must never be called for the already-applied row.
        expect(spy).not.toHaveBeenCalled();

        session.destroy();
    });

    it('(b) a released row key lands in appliedRemoteOrderKeys so a redelivered copy is skipped', async () => {
        const { session, unitId } = await mountSessionAtLocalPlayerTurn();
        const engine = session.getEngine()!;
        const atTick = engine.waitingForOrders?.atTick;
        if (typeof atTick !== 'number') throw new Error('expected waitingForOrders.atTick');

        const unit = engine.getUnit(unitId);
        if (!unit) throw new Error('missing unit');
        const col = Math.floor(unit.x / 40);
        const row = Math.floor(unit.y / 40);
        // Use p2's unitId for the remote order (p2 is a remote waiter).
        // We need a remote unit — pick any unit that isn't the local player's.
        const remoteOrder = makeWaitOrder(unitId, col + 2, row);
        const playerId = 'p2';
        const key = hashOrderId(playerId, atTick, remoteOrder);

        // Hold the row during the preview.
        const queueSpy = vi.spyOn(OrderManager.prototype, 'queueOrder');

        // Simulate an active ITS so applyRemoteOrders enters the hold branch.
        const its = session.interactiveTargeting;
        // Manually push the row through the hold path by activating ITS and calling applyRemoteOrders.
        // We use holdRemoteOrder directly to avoid needing a real engine begin().
        its['_isActive'] = true;

        session.applyRemoteOrders([{ atTick, order: remoteOrder, idHash: key, playerId }]);

        // While held, queueOrder must NOT have been called.
        expect(queueSpy).not.toHaveBeenCalled();

        // Now release: applyHeldRemoteOrders should call queueOrder once and register the key.
        const heldRows = [...(its['heldRemoteOrders'] as Map<string, { atTick: number; order: BattleOrder; key: string | null }>).values()];
        expect(heldRows).toHaveLength(1);
        expect(heldRows[0].key).toBe(key);

        its['_isActive'] = false;
        session.applyHeldRemoteOrders(heldRows);

        // queueOrder should have been called exactly once for the released row.
        expect(queueSpy).toHaveBeenCalledTimes(1);

        // A redelivered copy should now be skipped.
        queueSpy.mockClear();
        const result = session.applyRemoteOrders([{ atTick, order: remoteOrder, idHash: key, playerId }]);
        expect(queueSpy).not.toHaveBeenCalled();
        expect(result.skippedKeys).toContain(key);

        session.destroy();
    });
});
