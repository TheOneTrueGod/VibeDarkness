import { describe, expect, it } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import { ShatterAbility } from './0526Ability';
import { grantEarthCoreArmourFromSource } from '../../../abilities/earthCoreArmour';

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
        name: config.id,
    });
}

describe('ShatterAbility', () => {
    it('converts current armour into bonus damage and consumes nearby stone', () => {
        const caster = makeUnit({ id: 'caster', x: 50, y: 50, teamId: 'player', ownerId: 'p1' });
        const target = makeUnit({ id: 'target', x: 70, y: 50, teamId: 'enemy', ownerId: 'ai' });
        grantEarthCoreArmourFromSource(caster, 'test', 3, 10);

        let consumed = 0;
        const engine = {
            units: [caster, target],
            gameTime: 1,
            eventBus: new EventBus(),
            getUnit: (id: string) => [caster, target].find((u) => u.id === id),
            terrainManager: {
                grid: {
                    worldToGrid: (x: number, y: number) => ({ col: Math.floor(x / 40), row: Math.floor(y / 40) }),
                },
                consumeRockInRadius: () => {
                    consumed += 1;
                    return null;
                },
            },
        };

        ShatterAbility.doCardEffect(
            engine,
            caster,
            [{ type: 'pixel', position: { x: target.x, y: target.y } }],
            0.2,
            0.3,
        );

        // Base 6 + (3 armour * 2) bonus = 12.
        expect(target.hp).toBe(88);
        expect(consumed).toBe(1);
    });
});
