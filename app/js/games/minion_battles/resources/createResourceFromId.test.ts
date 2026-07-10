import { describe, expect, it } from 'vitest';
import { EventBus } from '../game/EventBus';
import { UnitManager } from '../game/managers/UnitManager';
import type { EngineContext } from '../game/EngineContext';
import { createPlayerUnit } from '../game/units/index';
import { Ammo } from './Ammo';
import { Movement } from './Movement';
import { ResourceId, ALL_SERIALIZABLE_RESOURCE_IDS } from './resourceIds';
import { createResourceFromId } from './createResourceFromId';
import { AMMO_DEFAULT_MAX } from './Ammo';

const AMMO_CURRENT_AFTER_SPEND = 42;

describe('createResourceFromId', () => {
    it('instantiates every serializable resource id', () => {
        for (const id of ALL_SERIALIZABLE_RESOURCE_IDS) {
            const resource = createResourceFromId(id);
            expect(resource, `missing factory for ${id}`).not.toBeNull();
            expect(resource!.id).toBe(id);
        }
    });

    it('returns null for unknown ids', () => {
        expect(createResourceFromId('not_a_resource')).toBeNull();
    });
});

describe('UnitManager.restoreFromJSON resource round-trip', () => {
    it('restores ammo and movement_points after checkpoint deserialize', () => {
        const eventBus = new EventBus();
        const ctx = { eventBus } as EngineContext;
        const unitManager = new UnitManager(ctx);

        const unit = createPlayerUnit(
            {
                x: 100,
                y: 100,
                teamId: 'player',
                ownerId: 'p1',
                name: 'Gunner',
                abilities: ['0203'],
                portraitId: 'warrior',
            },
            eventBus,
            { allocateObjectId: (prefix) => `${prefix}_1` },
        );
        unit.attachResource(new Ammo(), eventBus);
        unit.attachResource(new Movement(), eventBus);
        const ammo = unit.getResource(ResourceId.Ammo)!;
        ammo.current = AMMO_CURRENT_AFTER_SPEND;

        const serialized = [unit.toJSON()];
        unitManager.restoreFromJSON(serialized, eventBus);

        const restored = unitManager.units[0]!;
        const restoredAmmo = restored.getResource(ResourceId.Ammo);
        const restoredMovement = restored.getResource(ResourceId.MovementPoints);

        expect(restoredAmmo).toBeDefined();
        expect(restoredAmmo!.current).toBe(AMMO_CURRENT_AFTER_SPEND);
        expect(restoredAmmo!.max).toBe(AMMO_DEFAULT_MAX);
        expect(restoredMovement).toBeDefined();
        expect(restoredMovement!.current).toBe(2);
    });
});
