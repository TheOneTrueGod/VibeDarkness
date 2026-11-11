/**
 * LinkedAreaPulseBehaviour reads the caster's research modifiers for its ability: `damageFlat` per pulse
 * and `areaMult` (scales the area, so radii grow by its square root).
 */
import { describe, expect, it, vi } from 'vitest';
import '../AbilityRegistry';
import { Unit } from '../../game/units/Unit';
import { LinkedAreaPulseBehaviour } from './LinkedAreaPulseBehaviour';
import type { CastBehaviourTickContext } from '../castBehaviourTypes';

function unit(id: string, x: number, teamId: 'player' | 'enemy'): Unit {
    return new Unit({
        id, x, y: 0, hp: 100, maxHp: 100, speed: 100, teamId,
        ownerId: teamId === 'player' ? 'p1' : 'ai', characterId: 'target_dummy', name: id,
    });
}

function ctx(caster: Unit, units: Unit[]): CastBehaviourTickContext {
    let payload: unknown = { fired: 0 };
    return {
        caster,
        abilityId: '0713',
        target: undefined,
        allTargets: [],
        castPayload: {},
        get behaviourPayload() { return payload; },
        setBehaviourPayload: (p: unknown) => { payload = p; },
        engine: {
            units, gameTime: 1, roundNumber: 1,
            eventBus: { emit: vi.fn() },
            getUnit: (id: string) => units.find((u) => u.id === id),
        },
        windowProgress: 1,
        prevWindowProgress: 0,
        isFirstTick: false,
        isLastTick: true,
    } as unknown as CastBehaviourTickContext;
}

const pulse = () => new LinkedAreaPulseBehaviour()
    .withLink(() => null).withRadius(50).withLineWidth(20).withPulses(1).withDamage(4);

describe('LinkedAreaPulseBehaviour research modifiers', () => {
    it('adds damageFlat to each pulse', () => {
        const caster = unit('c', 0, 'player');
        const enemy = unit('e', 30, 'enemy');
        caster.abilityModifiers = { '0713': { damageFlat: 2 } };
        pulse().onTick(ctx(caster, [caster, enemy]));
        expect(enemy.hp).toBe(100 - 6);
    });

    it('scales the area by areaMult (radius and band width by its square root)', () => {
        const caster = unit('c', 0, 'player');
        caster.abilityModifiers = { '0713': { areaMult: 1.3 } };
        const area = pulse().resolveArea(ctx(caster, [caster]));
        expect(area.radius).toBeCloseTo(50 * Math.sqrt(1.3));
        expect(area.lineHalfWidth).toBeCloseTo(10 * Math.sqrt(1.3));
    });
});
