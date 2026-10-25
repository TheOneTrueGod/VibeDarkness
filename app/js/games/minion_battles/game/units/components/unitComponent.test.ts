import { describe, it, expect, afterEach } from 'vitest';
import { createGenericEnemy } from '../GenericEnemy';
import { EventBus } from '../../EventBus';
import { serializeUnit } from '../unitToJSON';
import { applySerializedUnitState } from '../unitFromJSON';
import type { Unit } from '../Unit';
import {
    applyUnitComponentsFromJSON,
    attachComponent,
    componentSpec,
    defineUnitComponent,
    findComponentState,
    getComponentOptions,
    getComponentState,
    listUnitComponentTypes,
    serializeUnitComponents,
    type UnitComponentType,
} from './unitComponent';
import { LANTERNITE_COMPONENT, lanterniteStateOf, peekLanterniteState } from './lanterniteComponent';
import { SWARM_COMPONENT, peekSwarmState, swarmStateOf } from './swarmComponent';
import { PET_COMPONENT, peekPetState, petStateOf } from './petComponent';
import {
    listHookedComponentIds,
    registerUnitComponentHooks,
    runUnitComponentDeath,
    runUnitComponentRoundMilestone,
    runUnitComponentTick,
    type UnitComponentContext,
} from './unitComponentHooks';
import { getUnitComponentSpecs } from '../unit_defs/unitDef';

function makeUnit(characterId: string): Unit {
    return createGenericEnemy(
        { id: `${characterId}_1`, x: 10, y: 20, hp: 10, speed: 0, teamId: 'enemy', characterId, name: characterId, abilities: [] },
        new EventBus(),
    );
}

interface CounterState {
    count: number;
    label: string | null;
}

const COUNTER_TYPE: UnitComponentType<CounterState, { label: string }> = {
    id: 'test_counter',
    create: (options) => ({ count: 0, label: options?.label ?? null }),
    toJSON: (s) => ({
        ...(s.count !== 0 ? { testCounterCount: s.count } : {}),
    }),
    fromJSON: (s, data) => {
        if (typeof data.testCounterCount === 'number') s.count = data.testCounterCount;
    },
};

describe('unit component registry', () => {
    it('registers the built-in component types', () => {
        const ids = listUnitComponentTypes().map((t) => t.id);
        expect(ids).toEqual(expect.arrayContaining(['lanternite', 'swarm', 'pet']));
    });

    it('rejects registering a different type under an existing id', () => {
        expect(() =>
            defineUnitComponent({ id: 'lanternite', create: () => ({}), toJSON: () => ({}), fromJSON: () => {} }),
        ).toThrow(/already registered/);
    });

    it('re-registering the same type object is a no-op', () => {
        expect(defineUnitComponent(LANTERNITE_COMPONENT)).toBe(LANTERNITE_COMPONENT);
    });
});

describe('def-declared components', () => {
    it('attaches declared components with their options at construction', () => {
        const nest = makeUnit('lanternite_nest');
        expect(nest.components.has('lanternite')).toBe(true);
        expect(getComponentOptions(nest, LANTERNITE_COMPONENT)).toEqual({ role: 'nest' });
        expect(nest.components.has('swarm')).toBe(false);

        const swarmling = makeUnit('swarmling');
        expect(getComponentOptions(swarmling, SWARM_COMPONENT)).toEqual({ role: 'swarmling' });
    });

    it('gives units without a declaration no components', () => {
        const slime = makeUnit('slime');
        expect(getUnitComponentSpecs('slime')).toBeUndefined();
        expect(slime.components.size).toBe(0);
    });
});

describe('component state access', () => {
    it('peek never attaches, the accessor attaches lazily with no options', () => {
        const slime = makeUnit('slime');
        expect(peekLanterniteState(slime)).toBeUndefined();
        expect(peekPetState(slime)).toBeUndefined();
        expect(slime.components.size).toBe(0);

        petStateOf(slime).defId = 'dog';
        expect(peekPetState(slime)?.defId).toBe('dog');
        expect(getComponentOptions(slime, PET_COMPONENT)).toBeUndefined();
        expect(findComponentState(slime, PET_COMPONENT)).toBe(petStateOf(slime));
    });

    it('keeps each type in its own slice', () => {
        const unit = makeUnit('slime');
        lanterniteStateOf(unit).role = 'scout';
        swarmStateOf(unit).orbitAngle = 1;
        expect(peekLanterniteState(unit)?.role).toBe('scout');
        expect(peekSwarmState(unit)?.orbitAngle).toBe(1);
        expect(unit.components.size).toBe(2);
    });
});

describe('component serialization', () => {
    it('writes nothing for untouched components', () => {
        const nest = makeUnit('lanternite_nest');
        expect(serializeUnitComponents(nest)).toEqual({});
        const serialized = serializeUnit(nest, 0);
        expect(Object.keys(serialized).filter((k) => /^(lanternit|lantern|swarm|pet)/i.test(k))).toEqual([]);
    });

    it('writes each slice at the top level under the legacy key names', () => {
        const unit = makeUnit('lanternite');
        lanterniteStateOf(unit).nestOwnerUnitId = 'nest_1';
        lanterniteStateOf(unit).role = 'defender';
        lanterniteStateOf(unit).attackReadyAtGameTime = 3;
        swarmStateOf(unit).orbitAngle = 2;
        petStateOf(unit).unitIds = ['p1'];
        expect(serializeUnit(unit, 0)).toMatchObject({
            lanterniteNestOwnerUnitId: 'nest_1',
            lanterniteRole: 'defender',
            lanterniteAttackReadyAtGameTime: 3,
            swarmlingOrbitAngle: 2,
            petUnitIds: ['p1'],
        });
    });

    it('round-trips through applySerializedUnitState, attaching undeclared components that have data', () => {
        const source = makeUnit('swarmling');
        swarmStateOf(source).currentNodeId = 'node_a';
        petStateOf(source).ownerUnitId = 'owner_1';
        const data = JSON.parse(JSON.stringify(serializeUnit(source, 0))) as Record<string, unknown>;

        const restored = makeUnit('swarmling');
        applySerializedUnitState(restored, data, new EventBus(), 0);
        expect(swarmStateOf(restored).currentNodeId).toBe('node_a');
        expect(peekPetState(restored)?.ownerUnitId).toBe('owner_1');
        // A component with no data in the checkpoint stays absent.
        expect(peekLanterniteState(restored)).toBeUndefined();
        expect(JSON.parse(JSON.stringify(serializeUnit(restored, 0)))).toEqual(data);
    });

    it('serializes a custom component and restores it', () => {
        defineUnitComponent(COUNTER_TYPE);
        const unit = makeUnit('slime');
        const instance = attachComponent(unit, componentSpec(COUNTER_TYPE, { label: 'a' }));
        instance.state.count = 4;
        expect(serializeUnitComponents(unit)).toEqual({ testCounterCount: 4 });

        const other = makeUnit('slime');
        applyUnitComponentsFromJSON(other, { testCounterCount: 4 });
        expect(getComponentState(other, COUNTER_TYPE).count).toBe(4);
        // Attached lazily from data, so the def options are not known.
        expect(getComponentOptions(other, COUNTER_TYPE)).toBeUndefined();
    });
});

describe('component hooks dispatch', () => {
    const unregister: Array<() => void> = [];
    afterEach(() => {
        while (unregister.length) unregister.pop()!();
    });

    const ctx = { gameTime: 1, dt: 0.1, units: [] } as unknown as UnitComponentContext;

    it('runs built-in hooks in lanternite, swarm order', () => {
        expect(listHookedComponentIds().slice(0, 2)).toEqual(['lanternite', 'swarm']);
    });

    it('runs every tick hook, then every lateTick hook, in registration order', () => {
        const calls: string[] = [];
        unregister.push(
            registerUnitComponentHooks(COUNTER_TYPE, {
                tick: () => calls.push('tick:a'),
                lateTick: () => calls.push('late:a'),
            }),
            registerUnitComponentHooks(COUNTER_TYPE, {
                tick: () => calls.push('tick:b'),
                lateTick: () => calls.push('late:b'),
            }),
        );
        // An empty world is enough for the built-in tick hooks to be no-ops; the respawn queue is stubbed.
        const emptyWorld = { ...ctx, units: [], state: { lanterniteRespawnManager: { gameTick: () => {} } } };
        runUnitComponentTick(emptyWorld as unknown as UnitComponentContext);
        expect(calls).toEqual(['tick:a', 'tick:b', 'late:a', 'late:b']);
    });

    it('milestone and death hooks only reach what they should', () => {
        const calls: string[] = [];
        unregister.push(
            registerUnitComponentHooks(COUNTER_TYPE, {
                onRoundMilestone: (m) => calls.push(`milestone:${m}`),
                onDeath: (u) => calls.push(`death:${u.id}`),
            }),
        );
        const stubCtx = { ...ctx, units: [], lightSources: [], state: { lanterniteRespawnManager: { onLanterniteUnitDied: () => {} } } };
        runUnitComponentRoundMilestone('round_half', stubCtx as unknown as UnitComponentContext);
        expect(calls).toEqual(['milestone:round_half']);

        const carrier = makeUnit('slime');
        attachComponent(carrier, componentSpec(COUNTER_TYPE));
        runUnitComponentDeath(carrier, stubCtx as unknown as UnitComponentContext);
        const bystander = makeUnit('slime');
        runUnitComponentDeath(bystander, stubCtx as unknown as UnitComponentContext);
        expect(calls).toEqual(['milestone:round_half', `death:${carrier.id}`]);
    });

    it('lanternite onDeath only reacts for creatures, not nests', () => {
        const queued: Array<[number, number]> = [];
        const stubCtx = {
            ...ctx,
            lightSources: [],
            state: { lanterniteRespawnManager: { onLanterniteUnitDied: (x: number, y: number) => queued.push([x, y]) } },
        } as unknown as UnitComponentContext;

        runUnitComponentDeath(makeUnit('lanternite_nest'), stubCtx);
        expect(queued).toEqual([]);

        const free = makeUnit('lanternite');
        runUnitComponentDeath(free, stubCtx);
        expect(queued).toEqual([[10, 20]]);

        const owned = makeUnit('lanternite');
        lanterniteStateOf(owned).nestOwnerUnitId = 'nest_1';
        runUnitComponentDeath(owned, stubCtx);
        expect(queued).toHaveLength(1);
    });
});
