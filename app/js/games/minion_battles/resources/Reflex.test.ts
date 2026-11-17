import { describe, expect, it } from 'vitest';
import { EventBus } from '../game/EventBus';
import { UnitManager } from '../game/managers/UnitManager';
import type { EngineContext } from '../game/EngineContext';
import type { Unit } from '../game/units/Unit';
import { createPlayerUnit } from '../game/units/index';
import { attachReflexIfKnown, Reflex, REFLEX_MAX, REFLEX_START } from './Reflex';
import { ResourceId } from './resourceIds';
import { createResourceFromId } from './createResourceFromId';
import { ALL_RESOURCE_DISPLAY_DEFS } from './resourceDisplayDefs';

const engine = { roundNumber: 2 } as EngineContext;

function makeUnit(eventBus: EventBus): Unit {
    return createPlayerUnit(
        { x: 100, y: 100, teamId: 'player', ownerId: 'p1', name: 'Hero', abilities: [], portraitId: 'warrior' },
        eventBus,
        { allocateObjectId: (prefix) => `${prefix}_1` },
    );
}

describe('Reflex', () => {
    it('starts at 1 of 1 and draws as a pip', () => {
        const reflex = new Reflex();
        expect(reflex.current).toBe(REFLEX_START);
        expect(reflex.max).toBe(REFLEX_MAX);
        expect(reflex.barStyle).toBe('pips');
        expect(ALL_RESOURCE_DISPLAY_DEFS.some((d) => d.id === ResourceId.Reflex)).toBe(true);
    });

    it('spends to 0, recovers 1 at round start and never exceeds max', () => {
        const reflex = new Reflex();
        expect(reflex.spend(1)).toBe(true);
        expect(reflex.current).toBe(0);
        expect(reflex.spend(1)).toBe(false);

        reflex.onRoundStart({} as Unit, engine);
        expect(reflex.current).toBe(1);
        reflex.onRoundStart({} as Unit, engine);
        expect(reflex.current).toBe(REFLEX_MAX);
    });

    it('is attached only when the owner knows Reactions, and only once', () => {
        const eventBus = new EventBus();
        const ignorant = makeUnit(eventBus);
        expect(attachReflexIfKnown(ignorant, eventBus, false)).toBeNull();
        expect(ignorant.getResource(ResourceId.Reflex)).toBeUndefined();

        const knowing = makeUnit(eventBus);
        expect(attachReflexIfKnown(knowing, eventBus, true)).not.toBeNull();
        expect(knowing.getResource(ResourceId.Reflex)?.current).toBe(REFLEX_START);
        expect(attachReflexIfKnown(knowing, eventBus, true)).toBeNull();
    });

    it('round-trips through unit serialization', () => {
        expect(createResourceFromId('reflex')).toBeInstanceOf(Reflex);

        const eventBus = new EventBus();
        const unit = makeUnit(eventBus);
        attachReflexIfKnown(unit, eventBus, true);
        unit.getResource(ResourceId.Reflex)!.spend(1);

        const unitManager = new UnitManager({ eventBus } as EngineContext);
        unitManager.restoreFromJSON([unit.toJSON()], eventBus);
        const restored = unitManager.units[0]!.getResource(ResourceId.Reflex);
        expect(restored).toBeInstanceOf(Reflex);
        expect(restored!.current).toBe(0);
        expect(restored!.max).toBe(REFLEX_MAX);
    });
});
