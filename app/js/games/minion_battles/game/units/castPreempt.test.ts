/**
 * Preempting orders (cast priority plan Step 2): an order carrying `castPriority` starts only when it is
 * strictly greater than the unit's effective priority, and then ends every running cast first
 * (`preemptUnitAbilities`). Orders without `castPriority` behave as before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAbilityForTest } from '../../abilities/AbilityRegistry';
import { AbilityEventType, refundAbilityCost, type AbilityStatic } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import { triggerAbilityEvent } from '../../abilities/events';
import type { EngineContext } from '../EngineContext';
import { OrderManager } from '../managers/OrderManager';
import type { ActiveAbility, BattleOrder } from '../types';
import { CAST_PRIORITY } from './castPriority';
import { Unit } from './Unit';

vi.mock('../../abilities/events', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    triggerAbilityEvent: vi.fn(),
}));

vi.mock('../../abilities/Ability', async (importOriginal) => {
    const original = await importOriginal<typeof import('../../abilities/Ability')>();
    return { ...original, refundAbilityCost: vi.fn(original.refundAbilityCost) };
});

type BehaviourRecord = Parameters<Unit['activeCastBehaviours']['set']>[1];

/** Windup [0,1), active [1,2), cooldown [2,3). */
function phasedAbility(id: string): AbilityStatic {
    const ability = {
        id,
        name: id,
        image: '',
        resourceCost: null,
        rechargeTurns: 0,
        targets: [],
        abilityTimings: [
            { id: 'windup', start: 0, end: 1, abilityPhase: AbilityPhase.Windup },
            { id: 'active', start: 1, end: 2, abilityPhase: AbilityPhase.Active },
            { id: 'cooldown', start: 2, end: 3, abilityPhase: AbilityPhase.Cooldown },
        ],
    } as unknown as AbilityStatic;
    registerAbilityForTest(ability);
    return ability;
}

const A = phasedAbility('test_preempt_a');
const B = phasedAbility('test_preempt_b');
const C = phasedAbility('test_preempt_c');

function makeUnit(): Unit {
    return new Unit({
        id: 'u', x: 0, y: 0, hp: 100, maxHp: 100, speed: 100,
        teamId: 'player', ownerId: 'p1', characterId: 'target_dummy', name: 'u', abilities: [A.id, B.id, C.id],
    });
}

function makeEngine(units: Unit[], gameTime: number) {
    const emit = vi.fn();
    const mixOrderFingerprint = vi.fn();
    const engine = {
        gameTime,
        gameTick: 10,
        units,
        eventBus: { emit },
        getUnit: (id: string) => units.find((u) => u.id === id),
        mixOrderFingerprint,
        trackAbilityUse: vi.fn(),
    } as unknown as EngineContext;
    return { engine, emit, mixOrderFingerprint, orders: new OrderManager(engine, () => {}) };
}

function startCast(unit: Unit, abilityId: string, startTime: number, castPriority?: number): ActiveAbility {
    const active: ActiveAbility = {
        abilityId,
        startTime,
        targets: [],
        castBehaviourPayloads: {},
        evadeFired: false,
        comboCount: 1,
        ...(castPriority !== undefined ? { castPriority } : {}),
    };
    unit.activeAbilities.push(active);
    return active;
}

function attachBehaviour(unit: Unit, active: ActiveAbility, key: string): ReturnType<typeof vi.fn> {
    const onInterrupt = vi.fn();
    unit.activeCastBehaviours.set(key, {
        entry: { behaviour: { onInterrupt } },
        intervalStart: 0,
        intervalEnd: 10,
        caster: unit,
        active,
        fireOnHitAtFirstTick: false,
    } as unknown as BehaviourRecord);
    return onInterrupt;
}

function order(abilityId: string, castPriority?: number, followUpOf?: string): BattleOrder {
    return {
        unitId: 'u',
        abilityId,
        targets: [],
        ...(castPriority !== undefined ? { castPriority } : {}),
        ...(followUpOf !== undefined ? { followUpOf } : {}),
    } as BattleOrder;
}

function castEndsFor(abilityId: string): number {
    return vi.mocked(triggerAbilityEvent).mock.calls
        .filter(([ctx]) => ctx.eventType === AbilityEventType.ON_CAST_END && ctx.ability.id === abilityId)
        .length;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('preempting orders', () => {
    it('a Major order replaces an unstamped cast in windup: end hooks fire, no refund, B is stamped', () => {
        const unit = makeUnit();
        const a = startCast(unit, A.id, 0);
        const onInterrupt = attachBehaviour(unit, a, 'a_beh');
        unit.setAbilityNote({ abilityId: A.id, abilityNote: 'x' });
        const { orders, emit } = makeEngine([unit], 0.5);

        orders.applyOrderLogic(order(B.id, CAST_PRIORITY.Major));

        expect(unit.activeAbilities.map((x) => x.abilityId)).toEqual([B.id]);
        expect(unit.activeAbilities[0]!.castPriority).toBe(CAST_PRIORITY.Major);
        expect(castEndsFor(A.id)).toBe(1);
        expect(onInterrupt).toHaveBeenCalledTimes(1);
        expect(unit.activeCastBehaviours.has('a_beh')).toBe(false);
        expect(emit).toHaveBeenCalledWith('cast_ended_early', expect.objectContaining({
            unitId: 'u', abilityId: A.id, castStartTime: 0, reason: 'preempted', outcome: 'cancelled',
        }));
        expect(vi.mocked(refundAbilityCost)).not.toHaveBeenCalled();
        expect(unit.abilityNote).toBeNull();
    });

    it('a Minor order on a unit running a Minor cast is dropped and the cast is untouched', () => {
        const unit = makeUnit();
        const a = startCast(unit, A.id, 0);
        unit.setMovement([{ col: 5, row: 5 }], undefined, 0);
        const { orders, emit, mixOrderFingerprint } = makeEngine([unit], 0.5);

        orders.applyOrderLogic({ ...order(B.id, CAST_PRIORITY.Minor), movePath: null });

        expect(unit.activeAbilities).toEqual([a]);
        expect(emit).not.toHaveBeenCalled();
        expect(mixOrderFingerprint).not.toHaveBeenCalled();
        expect(unit.movement).not.toBeNull();
    });

    it('a Minor order on a unit whose Major cast is in cooldown is dropped', () => {
        const unit = makeUnit();
        const a = startCast(unit, A.id, 0, CAST_PRIORITY.Major);
        const { orders } = makeEngine([unit], 2.5);

        orders.applyOrderLogic(order(B.id, CAST_PRIORITY.Minor));

        expect(unit.activeAbilities).toEqual([a]);
    });

    it('a Major order on a unit in a Major cooldown preempts it', () => {
        const unit = makeUnit();
        startCast(unit, A.id, 0, CAST_PRIORITY.Major);
        const { orders, emit } = makeEngine([unit], 2.5);

        orders.applyOrderLogic(order(B.id, CAST_PRIORITY.Major));

        expect(unit.activeAbilities.map((x) => x.abilityId)).toEqual([B.id]);
        expect(emit).toHaveBeenCalledWith('cast_ended_early', expect.objectContaining({ abilityId: A.id, reason: 'preempted' }));
    });

    it('an order with no castPriority on a casting unit behaves as before (both casts run)', () => {
        const unit = makeUnit();
        const a = startCast(unit, A.id, 0);
        const { orders, emit } = makeEngine([unit], 0.5);

        orders.applyOrderLogic(order(B.id));

        expect(unit.activeAbilities.map((x) => x.abilityId)).toEqual([A.id, B.id]);
        expect(unit.activeAbilities[0]).toBe(a);
        expect('castPriority' in unit.activeAbilities[1]!).toBe(false);
        expect(emit).not.toHaveBeenCalledWith('cast_ended_early', expect.anything());
    });

    it('a follow-up order replaces its running parent even at equal priority', () => {
        const unit = makeUnit();
        startCast(unit, A.id, 0, CAST_PRIORITY.Major);
        const { orders, emit } = makeEngine([unit], 1.5);

        orders.applyOrderLogic(order(B.id, CAST_PRIORITY.Major, A.id));

        expect(unit.activeAbilities.map((x) => x.abilityId)).toEqual([B.id]);
        expect(unit.activeAbilities[0]!.castPriority).toBe(CAST_PRIORITY.Major);
        expect(emit).toHaveBeenCalledWith('cast_ended_early', expect.objectContaining({ abilityId: A.id, reason: 'preempted' }));
    });

    it('a follow-up still ends the other running casts it outranks', () => {
        const unit = makeUnit();
        startCast(unit, A.id, 0, CAST_PRIORITY.Major);
        startCast(unit, C.id, 0);
        const { orders } = makeEngine([unit], 1.5);

        orders.applyOrderLogic(order(B.id, CAST_PRIORITY.Major, A.id));

        expect(unit.activeAbilities.map((x) => x.abilityId)).toEqual([B.id]);
    });

    it('a follow-up whose parent is not running is gated normally', () => {
        const unit = makeUnit();
        const a = startCast(unit, A.id, 0, CAST_PRIORITY.Major);
        const { orders, emit } = makeEngine([unit], 1.5);

        orders.applyOrderLogic(order(B.id, CAST_PRIORITY.Major, C.id));

        expect(unit.activeAbilities).toEqual([a]);
        expect(emit).not.toHaveBeenCalled();
    });
});
