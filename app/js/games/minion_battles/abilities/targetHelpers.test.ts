import { describe, expect, it, vi } from 'vitest';
import { damageEnemiesInCircle, damageEnemiesTouchingCaster } from './targetHelpers';
import type { Unit } from '../game/units/Unit';
import type { EventBus } from '../game/EventBus';

vi.mock('./blockingHelpers', () => ({
    tryDamageOrBlock: () => ({ hit: true }),
}));

function makeEnemy(id: string, x: number, y: number, hp = 100, radius = 10): Unit {
    return {
        id,
        x,
        y,
        radius,
        hp,
        maxHp: hp,
        teamId: 'enemy',
        isAlive: () => true,
        hasIFrames: () => false,
    } as Unit;
}

describe('damageEnemiesInCircle maxTargets', () => {
    it('damages only the closest enemies when maxTargets is set', () => {
        const damaged: string[] = [];
        const engine = {
            units: [
                makeEnemy('far', 30, 0),
                makeEnemy('mid', 20, 0),
                makeEnemy('near', 10, 0),
                makeEnemy('closest', 5, 0),
            ],
            gameTime: 0,
            eventBus: {} as EventBus,
        };
        const caster = { id: 'player', teamId: 'player' } as Unit;

        damageEnemiesInCircle({
            engine,
            caster,
            center: { x: 0, y: 0 },
            radius: 40,
            damage: 10,
            abilityId: 'test',
            maxTargets: 2,
            onHit: (unit) => damaged.push(unit.id),
        });

        expect(damaged).toEqual(['closest', 'near']);
    });
});

describe('damageEnemiesTouchingCaster maxTargets', () => {
    it('damages at most maxTargets distinct enemies across the cast', () => {
        const alreadyHitIds: string[] = [];
        const caster = { id: 'player', x: 0, y: 0, radius: 10, teamId: 'player' } as Unit;
        const engine = {
            units: [
                makeEnemy('e1', 15, 0),
                makeEnemy('e2', 16, 0),
                makeEnemy('e3', 17, 0),
                makeEnemy('e4', 18, 0),
                makeEnemy('e5', 19, 0),
                makeEnemy('e6', 20, 0),
            ],
            gameTime: 0,
            eventBus: {} as EventBus,
        };

        damageEnemiesTouchingCaster({
            engine,
            caster,
            abilityId: 'test',
            damage: 5,
            attackType: 'melee',
            alreadyHitIds,
            maxTargets: 5,
        });

        expect(alreadyHitIds).toHaveLength(5);
        expect(alreadyHitIds).not.toContain('e6');
    });
});
