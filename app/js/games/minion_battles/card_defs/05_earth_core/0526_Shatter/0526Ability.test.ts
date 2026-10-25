import { describe, expect, it, vi } from 'vitest';
import '../../../abilities/AbilityRegistry';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import { ShatterAbility } from './0526Ability';
import { grantEarthCoreArmourFromSource } from '../../../abilities/earthCoreArmour';
import { enterInterval } from '../earthCoreTestHelpers';

function makeUnit(config: { id: string; x: number; y: number; teamId: 'player' | 'enemy'; ownerId: string }): Unit {
    return new Unit({
        id: config.id,
        x: config.x,
        y: config.y,
        hp: 100,
        speed: 100,
        teamId: config.teamId,
        ownerId: config.ownerId,
        characterId: config.teamId === 'player' ? 'player' : 'dark_wolf',
        name: config.teamId === 'player' ? 'player' : 'dark_wolf',
    });
}

function makeEngine(units: Unit[]) {
    const consumeRockInRadius = vi.fn(() => null);
    const engine = {
        units,
        gameTime: 1,
        eventBus: new EventBus(),
        getUnit: (id: string) => units.find((u) => u.id === id),
        addEffect: () => {},
        requestHitPause: () => {},
        terrainManager: {
            grid: {
                worldToGrid: (x: number, y: number) => ({ col: Math.floor(x / 40), row: Math.floor(y / 40) }),
            },
            consumeRockInRadius,
        },
    } as unknown as AbilityEngineContext;
    return { engine, consumeRockInRadius };
}

describe('ShatterAbility', () => {
    it('is declarative', () => {
    });

    it('converts current armour into bonus damage and consumes nearby stone', () => {
        const caster = makeUnit({ id: 'caster', x: 50, y: 50, teamId: 'player', ownerId: 'p1' });
        const target = makeUnit({ id: 'target', x: 70, y: 50, teamId: 'enemy', ownerId: 'ai' });
        grantEarthCoreArmourFromSource(caster, 'test', 3, 10);
        const { engine, consumeRockInRadius } = makeEngine([caster, target]);

        enterInterval(ShatterAbility, 'burst', engine, caster, [{ type: 'pixel', position: { x: target.x, y: target.y } }]);

        // Base 6 + (3 armour * 2) bonus = 12.
        expect(target.hp).toBe(88);
        expect(consumeRockInRadius).toHaveBeenCalledTimes(1);
        expect(consumeRockInRadius).toHaveBeenCalledWith(1, 1, 1.5, 'caster');
    });

    it('hits only the enemy nearest the aim point, however far from the caster', () => {
        const caster = makeUnit({ id: 'caster', x: 50, y: 50, teamId: 'player', ownerId: 'p1' });
        const near = makeUnit({ id: 'near', x: 90, y: 50, teamId: 'enemy', ownerId: 'ai' });
        const far = makeUnit({ id: 'far', x: 400, y: 50, teamId: 'enemy', ownerId: 'ai' });
        const ally = makeUnit({ id: 'ally', x: 395, y: 50, teamId: 'player', ownerId: 'p2' });
        const { engine, consumeRockInRadius } = makeEngine([caster, near, far, ally]);

        enterInterval(ShatterAbility, 'burst', engine, caster, [{ type: 'pixel', position: { x: 390, y: 50 } }]);

        expect(far.hp).toBe(94);
        expect(near.hp).toBe(100);
        expect(ally.hp).toBe(100);
        expect(consumeRockInRadius).toHaveBeenCalledWith(10, 1, 1.5, 'caster');
    });

    it('does nothing when there is no enemy', () => {
        const caster = makeUnit({ id: 'caster', x: 50, y: 50, teamId: 'player', ownerId: 'p1' });
        const { engine, consumeRockInRadius } = makeEngine([caster]);

        enterInterval(ShatterAbility, 'burst', engine, caster, [{ type: 'pixel', position: { x: 90, y: 50 } }]);

        expect(consumeRockInRadius).not.toHaveBeenCalled();
    });
});
