import { describe, expect, it } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import { ShakingGroundAbility } from './0525Ability';

function makeUnit(config: { id: string; x: number; y: number; teamId: 'player' | 'enemy' }): Unit {
    return new Unit({
        x: config.x,
        y: config.y,
        hp: 100,
        speed: 100,
        teamId: config.teamId,
        ownerId: config.teamId === 'player' ? 'p1' : 'ai',
        characterId: config.teamId === 'player' ? 'player' : 'dark_wolf',
        name: config.teamId === 'player' ? 'player' : 'dark_wolf',
    });
}

describe('ShakingGroundAbility', () => {
    it('damages nearby enemies and triggers stone damage under caster', () => {
        const caster = makeUnit({ id: 'caster', x: 80, y: 80, teamId: 'player' });
        const nearEnemy = makeUnit({ id: 'near', x: 110, y: 80, teamId: 'enemy' });
        const farEnemy = makeUnit({ id: 'far', x: 260, y: 80, teamId: 'enemy' });
        let rockDamageCalls = 0;
        const engine = {
            units: [caster, nearEnemy, farEnemy],
            getUnit: (id: string) => [caster, nearEnemy, farEnemy].find((u) => u.id === id),
            gameTime: 1,
            eventBus: new EventBus(),
            terrainManager: {
                grid: { worldToGrid: () => ({ col: 2, row: 2 }) },
                damageRock: () => {
                    rockDamageCalls += 1;
                    return null;
                },
            },
        };

        ShakingGroundAbility.doCardEffect!(engine, caster, [], 0.3, 0.36);

        expect(nearEnemy.hp).toBe(90);
        expect(farEnemy.hp).toBe(100);
        expect(rockDamageCalls).toBe(1);
    });
});
