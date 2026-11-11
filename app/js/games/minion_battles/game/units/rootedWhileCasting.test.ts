/**
 * `UnitDefEntry.rootedWhileCasting`: the unit can't walk while a cast is winding up or active (the spirit
 * dog), even for abilities that declare no movement lock of their own. Its cooldown frees it, and units
 * without the flag keep walking.
 */
import { describe, expect, it } from 'vitest';
import '../../abilities/AbilityRegistry';
import { Unit } from './Unit';
import type { ActiveAbility } from '../types';
import { FLING_THORN_ABILITY_ID } from '../../card_defs/07_command_core/0705_FlingThorn/0705Ability';

// Fling Thorns (no movement lock): windup 0–0.6s, throws 0.6–1.05s, cooldown 1.05–1.65s.
function caster(characterId: string): Unit {
    const u = new Unit({ id: 'u', x: 0, y: 0, hp: 50, maxHp: 50, speed: 140, teamId: 'player', ownerId: 'p1', characterId, name: 'u' });
    u.activeAbilities.push({ abilityId: FLING_THORN_ABILITY_ID, startTime: 0, targets: [] } as unknown as ActiveAbility);
    return u;
}

describe('rootedWhileCasting', () => {
    it('roots the spirit dog through windup and throws', () => {
        const dog = caster('dog');
        expect(dog.getEffectiveSpeed(0.3)).toBe(0);
        expect(dog.getEffectiveSpeed(1.0)).toBe(0);
    });

    it('frees the spirit dog in the cooldown', () => {
        expect(caster('dog').getEffectiveSpeed(1.3)).toBe(140);
    });

    it('does not root units without the flag', () => {
        expect(caster('target_dummy').getEffectiveSpeed(1.0)).toBe(140);
    });
});
