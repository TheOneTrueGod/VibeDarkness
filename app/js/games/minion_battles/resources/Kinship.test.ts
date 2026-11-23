import { describe, expect, it } from 'vitest';
import { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';
import type { TeamId } from '../game/teams';
import { createPlayerUnit } from '../game/units/index';
import { petStateOf } from '../game/units/components/petComponent';
import { emitPetAttackHit } from '../game/units/petAttackHit';
import { Kinship, KINSHIP_MAX, KINSHIP_STARTING_AMOUNT } from './Kinship';
import { ResourceId } from './resourceIds';
import { createResourceFromId } from './createResourceFromId';
import { ALL_RESOURCE_DISPLAY_DEFS } from './resourceDisplayDefs';
import { attachResourcesFromEquipment } from '../storylines/BaseMissionDef';
import { CORE_ITEM_IDS } from '../character_defs/items';

let nextId = 0;
function makeUnit(eventBus: EventBus, teamId: TeamId = 'player'): Unit {
    return createPlayerUnit(
        { x: 100, y: 100, teamId, ownerId: 'p1', name: 'Unit', abilities: [], portraitId: 'warrior' },
        eventBus,
        { allocateObjectId: (prefix) => `${prefix}_${nextId++}` },
    );
}

/** An owner with Kinship, a pet of theirs, and an enemy, on one bus. */
function setup() {
    const eventBus = new EventBus();
    const owner = makeUnit(eventBus);
    const pet = makeUnit(eventBus);
    petStateOf(pet).ownerUnitId = owner.id;
    const enemy = makeUnit(eventBus, 'enemy');
    const units = [owner, pet, enemy];
    const engine = { eventBus, getUnit: (id: string) => units.find((u) => u.id === id) };
    const kinship = new Kinship();
    owner.attachResource(kinship, eventBus);
    return { eventBus, owner, pet, enemy, engine, kinship };
}

describe('Kinship', () => {
    it('starts at 4 of 10, is serializable and has a display def', () => {
        const kinship = new Kinship();
        expect(kinship.current).toBe(KINSHIP_STARTING_AMOUNT);
        expect(kinship.max).toBe(KINSHIP_MAX);
        expect(createResourceFromId(ResourceId.Kinship)).toBeInstanceOf(Kinship);
        expect(ALL_RESOURCE_DISPLAY_DEFS.some((d) => d.id === ResourceId.Kinship)).toBe(true);
    });

    it('the Command Core attaches it at 4 of 10', () => {
        const eventBus = new EventBus();
        const unit = makeUnit(eventBus);
        attachResourcesFromEquipment([CORE_ITEM_IDS.CommandCore], unit, eventBus);
        const kinship = unit.getResource(ResourceId.Kinship);
        expect(kinship?.current).toBe(4);
        expect(kinship?.max).toBe(10);
    });

    it('gains 1 each time the owner’s pet hits an enemy, up to 10', () => {
        const { owner, pet, enemy, engine, kinship } = setup();
        emitPetAttackHit(engine, { sourceUnitId: pet.id, targetUnitId: enemy.id, abilityId: '0701' });
        expect(kinship.current).toBe(5);
        for (let i = 0; i < 20; i++) {
            emitPetAttackHit(engine, { sourceUnitId: pet.id, targetUnitId: enemy.id, abilityId: '0701' });
        }
        expect(kinship.current).toBe(KINSHIP_MAX);
        expect(owner.getResource(ResourceId.Kinship)).toBe(kinship);
    });

    it('ignores the owner’s own hits and a pet hitting an ally', () => {
        const { owner, pet, enemy, engine, kinship } = setup();
        emitPetAttackHit(engine, { sourceUnitId: owner.id, targetUnitId: enemy.id, abilityId: '0101' });
        emitPetAttackHit(engine, { sourceUnitId: pet.id, targetUnitId: owner.id, abilityId: '0701' });
        expect(kinship.current).toBe(KINSHIP_STARTING_AMOUNT);
    });
});
