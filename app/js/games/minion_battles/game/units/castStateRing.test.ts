/**
 * `getCastStateRing`: what the cast-state ring (`UnitDefEntry.castStateRing`) shows for a unit.
 * Acting fills over windup + strike (full when the cooldown starts); recovering drains over the cooldown.
 */
import { describe, expect, it } from 'vitest';
import '../../abilities/AbilityRegistry';
import { Unit } from './Unit';
import type { ActiveAbility } from '../types';
import { getCastStateRing } from './castStateRing';
import { FLING_THORN_ABILITY_ID } from '../../card_defs/07_command_core/0705_FlingThorn/0705Ability';

// Fling Thorns: windup 0–0.6s, throws 0.6–1.05s, cooldown 1.05–1.65s.
function dog(...startTimes: number[]): Unit {
    const u = new Unit({ id: 'd', x: 0, y: 0, hp: 50, maxHp: 50, speed: 140, teamId: 'player', ownerId: 'p1', characterId: 'dog', name: 'd' });
    for (const startTime of startTimes) {
        u.activeAbilities.push({ abilityId: FLING_THORN_ABILITY_ID, startTime, targets: [] } as unknown as ActiveAbility);
    }
    return u;
}

describe('getCastStateRing', () => {
    it('is null with no cast (ready)', () => {
        expect(getCastStateRing(dog(), { gameTime: 5 })).toBeNull();
    });

    it('fills over windup + strike while acting', () => {
        const r = getCastStateRing(dog(0), { gameTime: 0.525 });
        expect(r?.kind).toBe('acting');
        expect(r?.fraction).toBeCloseTo(0.5);
    });

    it('drains over the cooldown while recovering', () => {
        const r = getCastStateRing(dog(0), { gameTime: 1.35 });
        expect(r?.kind).toBe('recovering');
        expect(r?.fraction).toBeCloseTo(0.5);
    });

    it('prefers acting over recovering when casts overlap', () => {
        const r = getCastStateRing(dog(0, 1.0), { gameTime: 1.2 });
        expect(r?.kind).toBe('acting');
        expect(r?.fraction).toBeCloseTo(0.2 / 1.05);
    });

    it('is null for units without the flag', () => {
        const u = dog(0);
        u.characterId = 'target_dummy';
        expect(getCastStateRing(u, { gameTime: 0.5 })).toBeNull();
    });
});
