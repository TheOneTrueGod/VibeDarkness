/**
 * Unit serialization tests: toJSON round-trip restores all saveable properties.
 */
import { describe, it, expect } from 'vitest';
import { Unit } from './Unit';
import { EventBus } from '../EventBus';
import { CELL_SIZE } from '../../terrain/TerrainGrid';

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
            characterId: 'player',
            portraitId: 'warrior',
            name: 'Test',
            abilities: ['throw_knife', '0101'],
            aiSettings: { minRange: 50, maxRange: 200 },
            combatSettings: { damageModifier: { flatAmt: 2, multiplier: 1 } },
        });
        unit.active = true;
        unit.waitMinEndTime = 10;
        unit.waitMaxEndTime = 20;
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
        expect(restored.portraitId).toBe(unit.portraitId);
        expect(restored.name).toBe(unit.name);
        expect(restored.waitMinEndTime).toBe(unit.waitMinEndTime);
        expect(restored.waitMaxEndTime).toBe(unit.waitMaxEndTime);
        expect(restored.radius).toBe(unit.radius);
        expect(restored.abilities).toEqual(unit.abilities);
        expect(restored.aiSettings).toEqual(unit.aiSettings);
        expect(restored.combatSettings).toEqual(unit.combatSettings);
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
        expect(restored.characterId).toBe('player');
        expect(restored.portraitId).toBe('ranger');
    });

    it('returns default damage modifier when unset', () => {
        const unit = new Unit({
            id: 'unit_3',
            x: 0,
            y: 0,
            hp: 10,
            speed: 100,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            name: 'NoMod',
        });
        expect(unit.getDamageModifier()).toEqual({ flatAmt: 0, multiplier: 1 });
    });

    it('clears wait lockout after min time when a live enemy is within 4 Chebyshev grid tiles (failsafe)', () => {
        const waiter = new Unit({
            id: 'unit_waiter',
            x: 0,
            y: 0,
            hp: 100,
            speed: 100,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            name: 'Waiter',
        });
        waiter.active = true;
        waiter.waitMinEndTime = 1;
        waiter.waitMaxEndTime = 10;
        waiter.setMovement(
            [
                { col: 0, row: 0 },
                { col: 1, row: 0 },
                { col: 2, row: 0 },
            ],
            undefined,
            0,
        );

        const foe = new Unit({
            id: 'unit_foe',
            x: 4 * CELL_SIZE,
            y: 0,
            hp: 50,
            speed: 100,
            teamId: 'enemy',
            ownerId: 'ai',
            characterId: 'enemy_grunt',
            name: 'Foe',
        });
        foe.active = true;

        waiter.update(1 / 60, { gameTime: 1, roundNumber: 1, units: [waiter, foe] });

        expect(waiter.isInWaitLockout()).toBe(false);
        expect(waiter.movement).not.toBeNull();
    });

    it('does not clear wait lockout from enemy failsafe before min time', () => {
        const waiter = new Unit({
            id: 'unit_waiter2',
            x: 0,
            y: 0,
            hp: 100,
            speed: 100,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            name: 'Waiter',
        });
        waiter.active = true;
        waiter.waitMinEndTime = 5;
        waiter.waitMaxEndTime = 10;
        waiter.setMovement([{ col: 0, row: 0 }, { col: 1, row: 0 }], undefined, 0);

        const foe = new Unit({
            id: 'unit_foe2',
            x: 0,
            y: 0,
            hp: 50,
            speed: 100,
            teamId: 'enemy',
            ownerId: 'ai',
            characterId: 'enemy_grunt',
            name: 'Foe',
        });
        foe.active = true;

        waiter.update(1 / 60, { gameTime: 4.9, roundNumber: 1, units: [waiter, foe] });

        expect(waiter.isInWaitLockout()).toBe(true);
    });

    it('does not clear wait lockout from enemy failsafe when nearest enemy is 5 Chebyshev tiles away', () => {
        const waiter = new Unit({
            id: 'unit_waiter3',
            x: 0,
            y: 0,
            hp: 100,
            speed: 100,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            name: 'Waiter',
        });
        waiter.active = true;
        waiter.waitMinEndTime = 1;
        waiter.waitMaxEndTime = 10;
        waiter.setMovement([{ col: 0, row: 0 }, { col: 1, row: 0 }], undefined, 0);

        const foe = new Unit({
            id: 'unit_foe3',
            x: 5 * CELL_SIZE,
            y: 0,
            hp: 50,
            speed: 100,
            teamId: 'enemy',
            ownerId: 'ai',
            characterId: 'enemy_grunt',
            name: 'Foe',
        });
        foe.active = true;

        waiter.update(1 / 60, { gameTime: 1, roundNumber: 1, units: [waiter, foe] });

        expect(waiter.isInWaitLockout()).toBe(true);
    });

    it('does not clear wait lockout from failsafe for allied units at close range', () => {
        const waiter = new Unit({
            id: 'unit_waiter4',
            x: 0,
            y: 0,
            hp: 100,
            speed: 100,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            name: 'Waiter',
        });
        waiter.active = true;
        waiter.waitMinEndTime = 1;
        waiter.waitMaxEndTime = 10;
        waiter.setMovement([{ col: 0, row: 0 }, { col: 1, row: 0 }], undefined, 0);

        const ally = new Unit({
            id: 'unit_ally',
            x: 0,
            y: 0,
            hp: 50,
            speed: 100,
            teamId: 'allied',
            ownerId: 'p2',
            characterId: 'player',
            name: 'Ally',
        });
        ally.active = true;

        waiter.update(1 / 60, { gameTime: 1, roundNumber: 1, units: [waiter, ally] });

        expect(waiter.isInWaitLockout()).toBe(true);
    });
});
