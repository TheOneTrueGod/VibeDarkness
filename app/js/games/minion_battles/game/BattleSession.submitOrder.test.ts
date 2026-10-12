/**
 * BattleSession order submission path: submitPlayerOrder delegates to BattleNet.
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
import type { PlayerState } from '../../../types';
import { BattleSession } from './BattleSession';
import type { BattleOrder } from './types';
import { ensureAbilityRuntimeState } from '../abilities/abilityUses';

const FIXED_DT = 1 / 60;

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

describe('BattleSession submitPlayerOrder + BattleNet', () => {
    it('awaits BattleNet submitOrder at the current pause tick', async () => {
        const { session, unitId } = await mountSessionAtLocalPlayerTurn();
        const engine = session.getEngine()!;
        const unit = engine.getUnit(unitId);
        if (!unit) throw new Error('missing unit');
        const atTick = engine.waitingForOrders?.atTick;
        if (typeof atTick !== 'number') throw new Error('expected waitingForOrders.atTick');
        const col = Math.floor(unit.x / 40);
        const row = Math.floor(unit.y / 40);

        let releaseNetSubmit: (() => void) | null = null;
        const netSubmitOrder = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    releaseNetSubmit = resolve;
                }),
        );
        session.setNetAdapter({
            submitOrder: netSubmitOrder,
        } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);

        const order = makeWaitOrder(unitId, col + 1, row);
        const done = session.submitPlayerOrder(order, { canSubmitOrders: true });

        expect(netSubmitOrder).toHaveBeenCalledTimes(1);
        expect(netSubmitOrder).toHaveBeenCalledWith(order, atTick);

        let finished = false;
        void done.then(() => {
            finished = true;
        });
        await Promise.resolve();
        expect(finished).toBe(false);

        releaseNetSubmit!();
        await done;
        expect(finished).toBe(true);

        session.destroy();
    });

    it('does not POST wait while an ITS preview is active (lobby 10EA88)', async () => {
        const { session, unitId } = await mountSessionAtLocalPlayerTurn();
        const engine = session.getEngine()!;
        const atTick = engine.waitingForOrders?.atTick;
        if (typeof atTick !== 'number') throw new Error('expected waitingForOrders.atTick');

        const netSubmitOrder = vi.fn(async () => {});
        session.setNetAdapter({
            submitOrder: netSubmitOrder,
        } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);

        // Swing Sword (0112) uses deferred-first select — begin leaves waitingForOrders set.
        const swordBegan = session.interactiveTargeting.begin(
            { unitId, abilityId: '0112', targets: [], endTurn: true },
            session,
        );
        expect(swordBegan).toBe(true);
        expect(session.interactiveTargeting.isActive).toBe(true);
        expect(engine.waitingForOrders?.atTick).toBe(atTick);

        await session.submitPlayerOrder(makeWaitOrder(unitId, 1, 1), { canSubmitOrders: true });
        expect(netSubmitOrder).not.toHaveBeenCalled();

        session.destroy();
    });

    /** Local unit paused on throw 1's Combo window, inside an ITS preview of throw 1. */
    function enterThrowOneComboWindowPreview(session: BattleSession, unitId: string) {
        const engine = session.getEngine()!;
        const unit = engine.getUnit(unitId);
        if (!unit) throw new Error('missing unit');
        unit.abilityModifiers = { throw_rock: { comboMax: 2 }, throw_charged_rock: { comboMax: 2 } };
        unit.activeAbilities = [{
            abilityId: 'throw_charged_rock',
            startTime: engine.gameTime,
            targets: [],
            conditionalCancelPaused: true,
            conditionalCancelTagFilter: ['Combo'],
        }];
        engine.sequentialTargetingPreviewCast = {
            unitId,
            abilityId: 'throw_charged_rock',
            startRound: engine.roundNumber, beganAtGameTime: engine.gameTime,
        };
        const its = session.interactiveTargeting as unknown as {
            _isActive: boolean;
            _previewOrderQueued: boolean;
            assumedRemoteWaitDuringPreview: boolean;
        };
        its._isActive = true;
        its._previewOrderQueued = true;
        return { engine, its };
    }

    it('combo follow-up commits throw 1 then begins ITS on the open pause plane (lobby E27AE2)', async () => {
        const { session, unitId } = await mountSessionAtLocalPlayerTurn();
        const { engine, its } = enterThrowOneComboWindowPreview(session, unitId);
        const pauseAtTick = engine.waitingForOrders!.atTick;

        const netSubmitOrder = vi.fn(async () => {});
        session.setNetAdapter({
            submitOrder: netSubmitOrder,
        } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);

        const commitSpy = vi.spyOn(session.interactiveTargeting, 'commit').mockImplementation(async () => {
            its._isActive = false;
            its._previewOrderQueued = false;
            engine.isSequentialTargetingPreview = false;
            engine.sequentialTargetingPreviewCast = null;
        });

        await session.submitPlayerOrder(
            { unitId, abilityId: 'throw_rock', targets: [], endTurn: true },
            { canSubmitOrders: true },
        );

        expect(commitSpy).toHaveBeenCalledWith(session, 'conditional_cancel_follow_up');
        expect(netSubmitOrder).not.toHaveBeenCalled();
        expect(session.interactiveTargeting.isActive).toBe(true);
        expect(session.interactiveTargeting.abilityId).toBe('throw_rock');
        expect(engine.waitingForOrders?.atTick).toBe(pauseAtTick);

        commitSpy.mockRestore();
        session.destroy();
    });

    it('combo follow-up at a canonical combo pause begins ITS instead of POSTing', async () => {
        const { session, unitId } = await mountSessionAtLocalPlayerTurn();
        const engine = session.getEngine()!;
        const unit = engine.getUnit(unitId)!;
        unit.abilityModifiers = { throw_rock: { comboMax: 2 } };
        unit.activeAbilities = [{
            abilityId: 'throw_rock',
            startTime: engine.gameTime,
            targets: [],
            conditionalCancelPaused: true,
            conditionalCancelTagFilter: ['Combo'],
        }];

        const netSubmitOrder = vi.fn(async () => {});
        session.setNetAdapter({
            submitOrder: netSubmitOrder,
        } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);

        await session.submitPlayerOrder(
            { unitId, abilityId: 'throw_rock', targets: [], endTurn: true },
            { canSubmitOrders: true },
        );

        expect(netSubmitOrder).not.toHaveBeenCalled();
        expect(session.interactiveTargeting.isActive).toBe(true);
        expect(session.interactiveTargeting.abilityId).toBe('throw_rock');

        session.destroy();
    });

    it('rejects a Charged Rock follow-up with no uses left instead of cancelling the paused throw (lobby E27AE2)', async () => {
        const { session, unitId } = await mountSessionAtLocalPlayerTurn();
        const engine = session.getEngine()!;
        const unit = engine.getUnit(unitId)!;
        unit.abilityModifiers = { throw_rock: { comboMax: 2 }, throw_charged_rock: { comboMax: 2 } };
        ensureAbilityRuntimeState(unit, 'throw_charged_rock');
        unit.abilityRuntime['throw_charged_rock']!.currentUses = 0;
        const pausedThrow = {
            abilityId: 'throw_rock',
            startTime: engine.gameTime,
            targets: [],
            conditionalCancelPaused: true,
            conditionalCancelTagFilter: ['Combo'],
        };
        unit.activeAbilities = [pausedThrow];

        const netSubmitOrder = vi.fn(async () => {});
        session.setNetAdapter({
            submitOrder: netSubmitOrder,
        } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);
        const failures: unknown[] = [];
        const unsub = session.subscribe((ev) => {
            if (ev.type === 'order_submit_failed') failures.push(ev);
        });

        await session.submitPlayerOrder(
            {
                unitId,
                abilityId: 'throw_charged_rock',
                targets: [{ type: 'pixel', position: { x: 100, y: 100 } }],
                abilityMode: 'basic',
                endTurn: true,
            },
            { canSubmitOrders: true },
        );

        expect(session.interactiveTargeting.isActive).toBe(false);
        expect(netSubmitOrder).not.toHaveBeenCalled();
        expect(failures).toHaveLength(1);
        expect(unit.activeAbilities).toEqual([pausedThrow]);

        unsub();
        session.destroy();
    });

    it('combo-ineligible follow-up does not enter ITS at a combo pause', async () => {
        const { session, unitId } = await mountSessionAtLocalPlayerTurn();
        const engine = session.getEngine()!;
        const unit = engine.getUnit(unitId)!;
        unit.abilityModifiers = {};
        unit.activeAbilities = [{
            abilityId: 'throw_rock',
            startTime: engine.gameTime,
            targets: [],
            conditionalCancelPaused: true,
            conditionalCancelTagFilter: ['Combo'],
        }];

        session.setNetAdapter({
            submitOrder: vi.fn(async () => {}),
        } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);

        await session.submitPlayerOrder(
            { unitId, abilityId: 'throw_rock', targets: [], endTurn: true },
            { canSubmitOrders: true },
        );

        expect(session.interactiveTargeting.isActive).toBe(false);

        session.destroy();
    });

    it('combo follow-up after an assumed remote pass commits throw 1 only', async () => {
        const { session, unitId } = await mountSessionAtLocalPlayerTurn();
        const { its } = enterThrowOneComboWindowPreview(session, unitId);

        const netSubmitOrder = vi.fn(async () => {});
        session.setNetAdapter({
            submitOrder: netSubmitOrder,
        } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);

        const commitSpy = vi.spyOn(session.interactiveTargeting, 'commit').mockImplementation(async () => {
            its._isActive = false;
        });

        its.assumedRemoteWaitDuringPreview = true;

        const followUpOrder: BattleOrder = {
            unitId,
            abilityId: 'throw_rock',
            targets: [{ type: 'pixel', position: { x: 100, y: 100 } }],
            endTurn: true,
        };
        await session.submitPlayerOrder(followUpOrder, { canSubmitOrders: true });

        expect(commitSpy).toHaveBeenCalledTimes(1);
        expect(commitSpy).toHaveBeenCalledWith(session, 'combo_window_after_assumed_pass');
        expect(netSubmitOrder).not.toHaveBeenCalled();

        commitSpy.mockRestore();
        session.destroy();
    });
});
