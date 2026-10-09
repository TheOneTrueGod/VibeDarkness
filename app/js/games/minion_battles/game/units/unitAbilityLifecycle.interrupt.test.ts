import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Unit } from './Unit';
import { executeUnitAbility, interruptUnitAbilities } from './unitAbilityLifecycle';
import { tickWallUnstick } from './unitWallUnstick';
import { tickUnitActiveAbilities } from './unitAbilityTick';
import { AbilityPhase } from '../../abilities/abilityTimings';
import { AbilityEventType, type AbilityInterruptPolicy, type AbilityStatic } from '../../abilities/Ability';
import { triggerAbilityEvent } from '../../abilities/events';
import type { EngineContext } from '../EngineContext';
import type { ActiveAbility } from '../types';

// Test-only ability registry: `getAbility` resolves ids from this map so the lifecycle code runs
// against hand-built abilities (the real registry is populated by card defs at import time).
const registry = vi.hoisted(() => ({ abilities: new Map<string, unknown>() }));

vi.mock('../../abilities/AbilityRegistry', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getAbility: (id: string) => registry.abilities.get(id),
}));

// Capture ON_CAST_END (and other) ability events without running real event rules.
vi.mock('../../abilities/events', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    triggerAbilityEvent: vi.fn(),
}));

type BehaviourRecord = Parameters<Unit['activeCastBehaviours']['set']>[1];

const CAST_TIMINGS = [
    { id: 'windup', start: 0, end: 1, abilityPhase: AbilityPhase.Windup },
    { id: 'cooldown', start: 1, end: 3, abilityPhase: AbilityPhase.Cooldown },
];

const NO_COOLDOWN_TIMINGS = [
    { id: 'windup', start: 0, end: 1, abilityPhase: AbilityPhase.Windup },
];

function makeAbility(
    id: string,
    opts: { interruptPolicy?: AbilityInterruptPolicy; timings?: typeof CAST_TIMINGS } = {},
): { ability: AbilityStatic } {
    const ability = {
        id,
        name: id,
        resourceCost: null,
        maxUses: 5,
        abilityTimings: opts.timings ?? CAST_TIMINGS,
        interruptPolicy: opts.interruptPolicy,
    } as unknown as AbilityStatic;
    registry.abilities.set(id, ability);
    return { ability };
}

function makeUnit(): Unit {
    return new Unit({
        id: 'unit',
        x: 100,
        y: 100,
        hp: 40,
        maxHp: 40,
        speed: 80,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'dark_wolf',
        name: 'Test Unit',
        abilities: [],
    });
}

function makeEngine(gameTime: number): EngineContext {
    return {
        gameTime,
        eventBus: { emit: vi.fn() },
        trackAbilityUse: vi.fn(),
        // Every tile is solid: used by the wall-unstick path.
        terrainManager: { isPassable: () => false },
    } as unknown as EngineContext;
}

function startCast(unit: Unit, abilityId: string, startTime: number): ActiveAbility {
    const active = {
        abilityId,
        startTime,
        targets: [],
        castBehaviourPayloads: {},
        evadeFired: false,
        comboCount: 1,
    } as ActiveAbility;
    unit.activeAbilities.push(active);
    return active;
}

/** Registers a cast behaviour record on the unit whose `onInterrupt` is a spy. */
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

function castEndCount(): number {
    return vi.mocked(triggerAbilityEvent).mock.calls
        .filter(([ctx]) => ctx.eventType === AbilityEventType.ON_CAST_END)
        .length;
}

beforeEach(() => {
    vi.clearAllMocks();
    registry.abilities.clear();
});

describe('interrupt pipeline runs the same steps on every path', () => {
    it('knockback interrupt (interruptAndRefundAbilities) fires onInterrupt and ON_CAST_END', () => {
        const { ability } = makeAbility('test_knockback_path');
        const unit = makeUnit();
        const active = startCast(unit, ability.id, 0);
        const onInterrupt = attachBehaviour(unit, active, 'k');

        unit.interruptAndRefundAbilities(makeEngine(0.5));

        expect(onInterrupt).toHaveBeenCalledTimes(1);
        expect(castEndCount()).toBe(1);
        expect(unit.activeAbilities).toHaveLength(0);
        expect(unit.activeCastBehaviours.has('k')).toBe(false);
    });

    it('stun interrupt (interruptAllAbilities) fires onInterrupt and ON_CAST_END', () => {
        const { ability } = makeAbility('test_stun_path');
        const unit = makeUnit();
        const active = startCast(unit, ability.id, 0);
        const onInterrupt = attachBehaviour(unit, active, 'k');

        unit.interruptAllAbilities(makeEngine(0.5));

        expect(onInterrupt).toHaveBeenCalledTimes(1);
        expect(castEndCount()).toBe(1);
        expect(unit.activeAbilities).toHaveLength(0);
    });

    it('wall-unstick removal fires onInterrupt and ON_CAST_END', () => {
        const { ability } = makeAbility('test_wall_unstick_path');
        const unit = makeUnit();
        const active = startCast(unit, ability.id, 0);
        const onInterrupt = attachBehaviour(unit, active, 'k');
        const engine = makeEngine(0.5);

        // Inside a wall for one tick: below WALL_SNAP_DELAY, so no bounce fires and no damage is taken.
        tickWallUnstick(unit, 0.01, engine);

        expect(onInterrupt).toHaveBeenCalledTimes(1);
        expect(castEndCount()).toBe(1);
        expect(unit.activeAbilities).toHaveLength(0);
    });

    it('same-id recast fires onInterrupt on the replaced cast', () => {
        const { ability } = makeAbility('test_recast_path');
        const unit = makeUnit();
        const old = startCast(unit, ability.id, 0);
        const onInterrupt = attachBehaviour(unit, old, 'k');
        const engine = makeEngine(0.5);

        executeUnitAbility(unit, ability, [], engine);

        expect(onInterrupt).toHaveBeenCalledTimes(1);
        expect(unit.activeAbilities).toHaveLength(1);
        expect(unit.activeAbilities[0]).not.toBe(old);
        expect(unit.activeAbilities[0]!.startTime).toBe(0.5);
    });
});

describe('interruptPolicy', () => {
    it('default policy (cancel before cooldown, ignore during cooldown) removes a windup cast', () => {
        const { ability } = makeAbility('test_policy_default');
        const unit = makeUnit();
        const active = startCast(unit, ability.id, 0);
        const onInterrupt = attachBehaviour(unit, active, 'k');
        unit.setAbilityNote({ abilityId: ability.id, abilityNote: {} } as never);

        interruptUnitAbilities(unit, makeEngine(0.5));

        expect(onInterrupt).toHaveBeenCalledTimes(1);
        expect(castEndCount()).toBe(1);
        expect(unit.activeAbilities).toHaveLength(0);
        expect(unit.abilityNote).toBeNull();
    });

    it('beforeCooldown skipToCooldown keeps the cast, snaps it to cooldown and clears its payload', () => {
        const { ability } = makeAbility('test_policy_skip', {
            interruptPolicy: { beforeCooldown: 'skipToCooldown' },
        });
        const unit = makeUnit();
        const active = startCast(unit, ability.id, 0);
        active.castPayload = { anything: true };
        const onInterrupt = attachBehaviour(unit, active, 'k');

        interruptUnitAbilities(unit, makeEngine(0.5));

        expect(unit.activeAbilities).toHaveLength(1);
        const kept = unit.activeAbilities[0]!;
        expect(kept.castPayload).toBeUndefined();
        expect(kept.castBehaviourPayloads).toEqual({});
        // Cooldown starts at elapsed 1, so the start time moves to (gameTime - 1).
        expect(0.5 - kept.startTime).toBeCloseTo(1);
        expect(onInterrupt).toHaveBeenCalledTimes(1);
        expect(castEndCount()).toBe(1);
    });

    it('skipToCooldown between a gate tick and its resumed tick clears the gate, so no pre-cooldown interval enters', () => {
        const midSetup = vi.fn();
        const { ability } = makeAbility('test_policy_skip_gate', {
            interruptPolicy: { beforeCooldown: 'skipToCooldown' },
            timings: [
                { id: 'windup', start: 0, end: 0.4, abilityPhase: AbilityPhase.Windup },
                {
                    id: 'mid',
                    start: 0.4,
                    end: 0.9,
                    abilityPhase: AbilityPhase.Active,
                    castBehaviours: [{ behaviour: { onSetup: midSetup } }],
                },
                { id: 'cooldown', start: 1, end: 3, abilityPhase: AbilityPhase.Cooldown },
            ] as typeof CAST_TIMINGS,
        });
        const unit = makeUnit();
        const active = startCast(unit, ability.id, 0);
        // State left by a gate tick that split at the start of 'mid'.
        active.processedElapsed = 0.4;
        active.pendingSelectGate = 'mid';

        interruptUnitAbilities(unit, makeEngine(0.41));

        expect(active.processedElapsed).toBeUndefined();
        expect(active.pendingSelectGate).toBeUndefined();

        const dt = 1 / 60;
        const tickEngine = { ...makeEngine(0.41 + dt), units: [unit] } as unknown as EngineContext;
        tickUnitActiveAbilities(unit, dt, tickEngine, () => {});

        expect(midSetup).not.toHaveBeenCalled();
        expect(unit.activeAbilities).toEqual([active]);
        // The processed window starts at the cooldown start, not at the stale resume point 0.4.
        const tickEvent = vi.mocked(triggerAbilityEvent).mock.calls
            .map(([ctx]) => ctx)
            .find((ctx) => ctx.eventType === AbilityEventType.ON_CAST_TICK);
        expect(tickEvent?.prevTime).toBeCloseTo(1);
    });

    it('skipToCooldown with no cooldown interval falls back to cancelling the cast', () => {
        const { ability } = makeAbility('test_policy_skip_no_cooldown', {
            interruptPolicy: { beforeCooldown: 'skipToCooldown' },
            timings: NO_COOLDOWN_TIMINGS as typeof CAST_TIMINGS,
        });
        const unit = makeUnit();
        const active = startCast(unit, ability.id, 0);
        const onInterrupt = attachBehaviour(unit, active, 'k');

        interruptUnitAbilities(unit, makeEngine(0.5));

        expect(unit.activeAbilities).toHaveLength(0);
        expect(onInterrupt).toHaveBeenCalledTimes(1);
        expect(castEndCount()).toBe(1);
    });

    it('duringCooldown ignore keeps a cooldown cast untouched (no ON_CAST_END, no behaviour cleanup)', () => {
        const { ability } = makeAbility('test_policy_ignore');
        const unit = makeUnit();
        const active = startCast(unit, ability.id, 0);
        const onInterrupt = attachBehaviour(unit, active, 'k');

        // Elapsed 1.5 sits inside the cooldown interval [1, 3).
        interruptUnitAbilities(unit, makeEngine(1.5));

        expect(unit.activeAbilities).toEqual([active]);
        expect(onInterrupt).not.toHaveBeenCalled();
        expect(castEndCount()).toBe(0);
    });

    it('duringCooldown end removes a cooldown cast with ON_CAST_END and behaviour cleanup', () => {
        const { ability } = makeAbility('test_policy_end', {
            interruptPolicy: { duringCooldown: 'end' },
        });
        const unit = makeUnit();
        const active = startCast(unit, ability.id, 0);
        const onInterrupt = attachBehaviour(unit, active, 'k');

        interruptUnitAbilities(unit, makeEngine(1.5));

        expect(unit.activeAbilities).toHaveLength(0);
        expect(onInterrupt).toHaveBeenCalledTimes(1);
        expect(castEndCount()).toBe(1);
    });
});
