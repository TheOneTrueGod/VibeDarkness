/**
 * Unit serialization tests: toJSON round-trip restores all saveable properties.
 */
import { describe, it, expect } from 'vitest';
import { Unit } from './Unit';
import { EventBus } from '../engine/EventBus';

describe('Unit', () => {
    it('serializes and restores to an equivalent object', () => {
        const eventBus = new EventBus();
        const unit = new Unit({
            id: 'unit_1',
            x: 100,
            y: 200,
            hp: 80,
            maxHp: 100,
            speed: 120,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'warrior',
            name: 'Test',
            abilities: ['throw_knife', '0101'],
            aiSettings: { minRange: 50, maxRange: 200 },
        });
        unit.active = true;
        unit.cooldownRemaining = 0.5;
        unit.cooldownTotal = 1;
        unit.radius = 25;
        unit.setMovement([{ col: 2, row: 3 }, { col: 3, row: 3 }], undefined, 42);

        const json = unit.toJSON();
        const restored = Unit.fromJSON(json, eventBus);

        expect(restored.id).toBe(unit.id);
        expect(restored.x).toBe(unit.x);
        expect(restored.y).toBe(unit.y);
        expect(restored.active).toBe(unit.active);
        expect(restored.hp).toBe(unit.hp);
        expect(restored.maxHp).toBe(unit.maxHp);
        expect(restored.speed).toBe(unit.speed);
        expect(restored.teamId).toBe(unit.teamId);
        expect(restored.ownerId).toBe(unit.ownerId);
        expect(restored.characterId).toBe(unit.characterId);
        expect(restored.name).toBe(unit.name);
        expect(restored.cooldownRemaining).toBe(unit.cooldownRemaining);
        expect(restored.cooldownTotal).toBe(unit.cooldownTotal);
        expect(restored.radius).toBe(unit.radius);
        expect(restored.abilities).toEqual(unit.abilities);
        expect(restored.aiSettings).toEqual(unit.aiSettings);
        expect(restored.movement).not.toBeNull();
        expect(restored.movement!.path).toEqual(unit.movement!.path);
        expect(restored.movement!.pathfindingTick).toBe(unit.movement!.pathfindingTick);
    });

    it('restores unit without movement', () => {
        const eventBus = new EventBus();
        const unit = new Unit({
            id: 'unit_2',
            x: 50,
            y: 50,
            hp: 100,
            speed: 100,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'ranger',
            name: 'Ranger',
        });
        const json = unit.toJSON();
        const restored = Unit.fromJSON(json, eventBus);
        expect(restored.movement).toBeNull();
        expect(restored.x).toBe(50);
        expect(restored.y).toBe(50);
    });
});
