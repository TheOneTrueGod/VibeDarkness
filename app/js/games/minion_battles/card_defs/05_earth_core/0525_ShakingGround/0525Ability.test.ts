import { describe, expect, it, vi } from 'vitest';
import '../../../abilities/AbilityRegistry';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import { ShakingGroundAbility } from './0525Ability';
import { enterInterval } from '../earthCoreTestHelpers';

function makeUnit(config: { id: string; x: number; y: number; teamId: 'player' | 'enemy' }): Unit {
    return new Unit({
        id: config.id,
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

function makeEngine(units: Unit[], intactRock: boolean) {
    const damageRock = vi.fn(() => null);
    const engine = {
        units,
        getUnit: (id: string) => units.find((u) => u.id === id),
        gameTime: 1,
        eventBus: new EventBus(),
        addEffect: () => {},
        requestHitPause: () => {},
        terrainManager: {
            grid: { worldToGrid: () => ({ col: 2, row: 2 }) },
            isIntactRockAt: () => intactRock,
            damageRock,
        },
    } as unknown as AbilityEngineContext;
    return { engine, damageRock };
}

describe('ShakingGroundAbility', () => {
    it('is declarative', () => {
    });

    it('damages nearby enemies and damages the stone tile under the caster', () => {
        const caster = makeUnit({ id: 'caster', x: 80, y: 80, teamId: 'player' });
        const nearEnemy = makeUnit({ id: 'near', x: 110, y: 80, teamId: 'enemy' });
        const farEnemy = makeUnit({ id: 'far', x: 260, y: 80, teamId: 'enemy' });
        const { engine, damageRock } = makeEngine([caster, nearEnemy, farEnemy], true);

        enterInterval(ShakingGroundAbility, 'quake', engine, caster, []);

        expect(nearEnemy.hp).toBe(90);
        expect(farEnemy.hp).toBe(100);
        expect(damageRock).toHaveBeenCalledTimes(1);
        expect(damageRock).toHaveBeenCalledWith(2, 2, undefined, 'caster');
    });

    it('leaves non-stone ground alone', () => {
        const caster = makeUnit({ id: 'caster', x: 80, y: 80, teamId: 'player' });
        const { engine, damageRock } = makeEngine([caster], false);

        enterInterval(ShakingGroundAbility, 'quake', engine, caster, []);

        expect(damageRock).not.toHaveBeenCalled();
    });

    it('does not strike before the quake window', () => {
        const caster = makeUnit({ id: 'caster', x: 80, y: 80, teamId: 'player' });
        const enemy = makeUnit({ id: 'near', x: 110, y: 80, teamId: 'enemy' });
        const { engine, damageRock } = makeEngine([caster, enemy], true);

        enterInterval(ShakingGroundAbility, 'windup', engine, caster, []);

        expect(enemy.hp).toBe(100);
        expect(damageRock).not.toHaveBeenCalled();
    });
});
