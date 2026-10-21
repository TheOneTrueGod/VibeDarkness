import { describe, expect, it, vi } from 'vitest';
import { applyBleedStack } from '../../buffs/bleedRuntime';
import { EventBus } from '../../game/EventBus';
import { Unit } from '../../game/units/Unit';
import type { EngineContext } from '../../game/EngineContext';
import { DEFAULT_UNIT_RADIUS } from '../../game/units/unit_defs/unitConstants';
import type { TeamId } from '../../game/teams';
import { REND_RADIUS } from './rendKeyword';
import { perRendHit } from './rendRuntime';
import { runAbilityKeywords } from './runAbilityKeywords';
import type { KeywordContext } from './keywordTypes';

function makeUnit(id: string, team: TeamId, x: number, y: number): Unit {
    return new Unit({
        id, x, y, hp: 100, maxHp: 100, speed: 100, teamId: team,
        ownerId: team === 'player' ? 'p1' : 'ai', characterId: 'enemy', name: id,
        radius: DEFAULT_UNIT_RADIUS,
    });
}

function makeCtx(units: Unit[], caster: Unit, center?: { x: number; y: number }): KeywordContext {
    const engine = {
        gameTime: 0, gameTick: 0, roundNumber: 1, eventBus: new EventBus(), units,
        terrainManager: null, getUnit: (id: string) => units.find((u) => u.id === id),
        trackAbilityUse: vi.fn(), addEffectEmitter: vi.fn(), addEffect: vi.fn(),
    } as unknown as EngineContext;
    return { engine, caster, abilityId: 'test_rend', center };
}

describe('rend keyword resolver', () => {
    it('rends bleeding enemies around ctx.center, reports count, and runs the use effect', () => {
        const caster = makeUnit('caster', 'player', 0, 0);
        const center = { x: 500, y: 500 };
        const near1 = makeUnit('near1', 'enemy', 520, 500);
        const near2 = makeUnit('near2', 'enemy', 500, 540);
        const clean = makeUnit('clean', 'enemy', 480, 500);
        const far = makeUnit('far', 'enemy', 500 + REND_RADIUS + 60, 500);
        for (const u of [near1, near2, far]) applyBleedStack(u, 0, 1, 1);
        const ctx = makeCtx([caster, near1, near2, clean, far], caster, center);

        const applied: number[] = [];
        const results = runAbilityKeywords(ctx, [
            { keyword: 'rend', n: 4, effect: perRendHit(3, (total) => applied.push(total)) },
        ]);

        expect(results).toEqual([{ triggered: true, count: 2 }]);
        expect(applied).toEqual([6]);
        expect(near1.hp).toBe(96);
        expect(near2.hp).toBe(96);
        expect(clean.hp).toBe(100);
        expect(far.hp).toBe(100);
    });

    it('skips the effect when nothing is hit', () => {
        const caster = makeUnit('caster', 'player', 0, 0);
        const clean = makeUnit('clean', 'enemy', 10, 0);
        const ctx = makeCtx([caster, clean], caster);
        const effect = vi.fn();

        const results = runAbilityKeywords(ctx, [{ keyword: 'rend', n: 4, effect }]);

        expect(results).toEqual([{ triggered: false, count: 0 }]);
        expect(effect).not.toHaveBeenCalled();
        expect(clean.hp).toBe(100);
    });

    it('defaults the centre to the caster', () => {
        const caster = makeUnit('caster', 'player', 100, 100);
        const enemy = makeUnit('e', 'enemy', 130, 100);
        applyBleedStack(enemy, 0, 1, 1);
        const results = runAbilityKeywords(makeCtx([caster, enemy], caster), [{ keyword: 'rend', n: 2 }]);
        expect(results[0]).toEqual({ triggered: true, count: 1 });
        expect(enemy.hp).toBe(98);
    });
});
