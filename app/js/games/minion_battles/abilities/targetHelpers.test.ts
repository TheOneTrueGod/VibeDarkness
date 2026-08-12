import { describe, expect, it, vi } from 'vitest';
import {
    damageEnemiesInCircle,
    damageEnemiesTouchingCaster,
    damageEnemiesInTruncatedCone,
} from './targetHelpers';
import type { Unit } from '../game/units/Unit';
import type { EventBus } from '../game/EventBus';
import { tryDamageOrBlock } from './blockingHelpers';

vi.mock('./blockingHelpers', () => ({
    tryDamageOrBlock: vi.fn(() => ({ hit: true })),
}));

function makeEnemy(
    id: string,
    x: number,
    y: number,
    opts?: { hp?: number; radius?: number; hasIFrames?: boolean },
): Unit {
    const hp = opts?.hp ?? 100;
    return {
        id,
        x,
        y,
        radius: opts?.radius ?? 10,
        hp,
        maxHp: hp,
        teamId: 'enemy',
        active: true,
        isAlive: () => true,
        isSpawning: () => false,
        hasIFrames: () => opts?.hasIFrames ?? false,
    } as unknown as Unit;
}

describe('damageEnemiesInCircle', () => {
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

    it('excludes enemies with active iFrames (CircleHitbox combat filter)', () => {
        const damaged: string[] = [];
        const engine = {
            units: [
                makeEnemy('vulnerable', 10, 0),
                makeEnemy('dodging', 12, 0, { hasIFrames: true }),
            ],
            gameTime: 1,
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
            onHit: (unit) => damaged.push(unit.id),
        });

        expect(damaged).toEqual(['vulnerable']);
    });
});

describe('damageEnemiesInTruncatedCone', () => {
    it('does not call tryDamageOrBlock for iframe enemies in the cone', () => {
        const tryDamageSpy = vi.mocked(tryDamageOrBlock);
        tryDamageSpy.mockClear();

        const engine = {
            units: [
                makeEnemy('vulnerable', 50, 0),
                makeEnemy('dodging', 55, 0, { hasIFrames: true }),
            ],
            gameTime: 1,
            eventBus: {} as EventBus,
        };
        const caster = { id: 'player', x: 0, y: 0, teamId: 'player' } as Unit;

        damageEnemiesInTruncatedCone({
            engine,
            caster,
            aimX: 100,
            aimY: 0,
            minR: 0,
            maxR: 100,
            halfAngleRad: Math.PI / 2,
            damage: 10,
            abilityId: 'test',
        });

        const hitIds = tryDamageSpy.mock.calls.map((call) => (call[0] as Unit).id);
        expect(hitIds).toEqual(['vulnerable']);
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
