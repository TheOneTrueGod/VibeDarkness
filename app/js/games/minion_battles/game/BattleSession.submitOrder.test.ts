/**
 * BattleSession sync bridge: submitPlayerOrder awaits submitOrder before saveCheckpoint.
 */
import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';

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
import type { MinionBattlesApi } from '../api/minionBattlesApi';
import type { PlayerState } from '../../../../types';
import { BattleSession } from './BattleSession';
import type { BattleOrder } from './types';

const FIXED_DT = 1 / 60;

function makeApiStub(): MinionBattlesApi {
    return {
        setCurrentPlayerId: vi.fn(),
        sendMessage: vi.fn().mockResolvedValue({ messageId: 1 }),
    } as unknown as MinionBattlesApi;
}

function mountSessionAtLocalPlayerTurn(): { session: BattleSession; unitId: string } {
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

    session.load(players, characterSelections, null);
    const live = session.getEngine()!;
    live.stop();

    for (let i = 0; i < 400; i++) {
        (live as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
        if (live.waitingForOrders?.ownerId === 'p1') {
            return { session, unitId: live.waitingForOrders.unitId };
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

describe('BattleSession submitPlayerOrder + sync bridge', () => {
    it('awaits submitOrder before calling saveCheckpoint (submit resolves after ack)', async () => {
        const { session, unitId } = mountSessionAtLocalPlayerTurn();
        const unit = session.getEngine()!.getUnit(unitId);
        if (!unit) throw new Error('missing unit');
        const col = Math.floor(unit.x / 40);
        const row = Math.floor(unit.y / 40);

        let releaseSubmit: (() => void) | null = null;
        const submitOrder = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    releaseSubmit = resolve;
                }),
        );
        const saveCheckpoint = vi.fn().mockResolvedValue(null);

        session.setSyncBridge({ saveCheckpoint, submitOrder });

        const order = makeWaitOrder(unitId, col + 1, row);
        const done = session.submitPlayerOrder(order, { canSubmitOrders: true });

        expect(submitOrder).toHaveBeenCalledTimes(1);
        expect(saveCheckpoint).not.toHaveBeenCalled();

        releaseSubmit!();
        await done;

        expect(saveCheckpoint).toHaveBeenCalled();
        const submitMs = submitOrder.mock.invocationCallOrder[0];
        const checkpointMs = saveCheckpoint.mock.invocationCallOrder[0];
        expect(checkpointMs).toBeGreaterThan(submitMs);

        session.destroy();
    });
});
