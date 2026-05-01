import { describe, expect, it } from 'vitest';
import { Resonance } from './Resonance';
import { EventBus } from '../game/EventBus';
import { Unit } from '../game/units/Unit';
import {
    EARTH_CORE_RESONANCE_GAIN_ROUND_START,
    EARTH_CORE_RESONANCE_GAIN_STONE_DAMAGED_NEARBY,
    EARTH_CORE_RESONANCE_GAIN_ON_ARMOUR_LOST_FROM_DAMAGE,
    EARTH_CORE_RESONANCE_MAX,
} from '../card_defs/earth_core/earthCoreConstants';
import { IMPACT_CONVERSION_PASSIVE_ID } from '../abilities/earthCoreMeleePassives';
import { grantEarthCoreArmourFromSource } from '../abilities/earthCoreArmour';

function makeUnit(id: string): Unit {
    return new Unit({
        id,
        x: 0,
        y: 0,
        hp: 100,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        name: id,
    });
}

describe('Resonance', () => {
    it('starts at 0 and uses Earth Core max cap', () => {
        const resonance = new Resonance();
        expect(resonance.current).toBe(0);
        expect(resonance.max).toBe(EARTH_CORE_RESONANCE_MAX);
    });

    it('gains at round start for attached unit', () => {
        const eventBus = new EventBus();
        const unit = makeUnit('unit_a');
        const resonance = new Resonance();
        unit.attachResource(resonance, eventBus);

        eventBus.emit('round_start', { roundNumber: 1 });
        expect(resonance.current).toBe(EARTH_CORE_RESONANCE_GAIN_ROUND_START);
    });

    it('gains from nearby stone damage only when self/ally caused and unit id matches', () => {
        const eventBus = new EventBus();
        const unit = makeUnit('unit_a');
        const resonance = new Resonance();
        unit.attachResource(resonance, eventBus);

        eventBus.emit('nearby_stone_damaged', {
            unitId: 'unit_a',
            sourceUnitId: 'unit_b',
            causedBySelfOrAlly: false,
        });
        eventBus.emit('nearby_stone_damaged', {
            unitId: 'unit_other',
            sourceUnitId: 'unit_a',
            causedBySelfOrAlly: true,
        });
        expect(resonance.current).toBe(0);

        eventBus.emit('nearby_stone_damaged', {
            unitId: 'unit_a',
            sourceUnitId: 'unit_a',
            causedBySelfOrAlly: true,
            col: 2,
            row: 3,
        });
        expect(resonance.current).toBe(EARTH_CORE_RESONANCE_GAIN_STONE_DAMAGED_NEARBY);
    });

    it('caps at max when incremented by events', () => {
        const eventBus = new EventBus();
        const unit = makeUnit('unit_a');
        const resonance = new Resonance();
        unit.attachResource(resonance, eventBus);

        for (let i = 0; i < 50; i++) {
            eventBus.emit('round_start', { roundNumber: i + 1 });
        }
        expect(resonance.current).toBe(EARTH_CORE_RESONANCE_MAX);
    });

    it('stops reacting after detach', () => {
        const eventBus = new EventBus();
        const unit = makeUnit('unit_a');
        const resonance = new Resonance();
        unit.attachResource(resonance, eventBus);
        unit.detachAllResources(eventBus);

        eventBus.emit('round_start', { roundNumber: 1 });
        eventBus.emit('nearby_stone_damaged', {
            unitId: 'unit_a',
            sourceUnitId: 'unit_a',
            causedBySelfOrAlly: true,
        });
        expect(resonance.current).toBe(0);
    });

    it('gains from damage_taken only when Impact Conversion passive is present and armour is removed', () => {
        const eventBus = new EventBus();
        const unit = makeUnit('unit_a');
        const resonance = new Resonance();
        unit.attachResource(resonance, eventBus);

        eventBus.emit('damage_taken', { unitId: unit.id, amount: 4, sourceUnitId: 'enemy', armourRemoved: 3 });
        expect(resonance.current).toBe(0);

        unit.abilities.push(IMPACT_CONVERSION_PASSIVE_ID);
        eventBus.emit('damage_taken', { unitId: unit.id, amount: 4, sourceUnitId: 'enemy', armourRemoved: 0 });
        expect(resonance.current).toBe(0);

        eventBus.emit('damage_taken', { unitId: unit.id, amount: 4, sourceUnitId: 'enemy', armourRemoved: 2 });
        expect(resonance.current).toBe(EARTH_CORE_RESONANCE_GAIN_ON_ARMOUR_LOST_FROM_DAMAGE);
    });

    it('gains from real damage instances that consume armour', () => {
        const eventBus = new EventBus();
        const unit = makeUnit('unit_a');
        const resonance = new Resonance();
        unit.attachResource(resonance, eventBus);
        unit.abilities.push(IMPACT_CONVERSION_PASSIVE_ID);
        grantEarthCoreArmourFromSource(unit, 'test_source', 2, 10);

        unit.takeDamage(1, 'enemy', eventBus);
        expect(resonance.current).toBe(EARTH_CORE_RESONANCE_GAIN_ON_ARMOUR_LOST_FROM_DAMAGE);
    });
});
