/**
 * Spirit Flurry (0711): `repeatCountFlat` adds strikes inside the same total time (Frenzied Flurry).
 */
import { describe, expect, it } from 'vitest';
import '../../../abilities/AbilityRegistry';
import { AbilityPhase, normalizeAbilityTimingsToIntervals, resolveAbilityTimingEntries } from '../../../abilities/abilityTimings';
import { Unit } from '../../../game/units/Unit';
import { SPIRIT_FLURRY_ANGLES, SpiritFlurryAbility } from './0711Ability';

function spirit(repeatCountFlat?: number): Unit {
    const u = new Unit({ id: 's', x: 0, y: 0, hp: 50, maxHp: 50, speed: 140, teamId: 'player', ownerId: 'p1', characterId: 'dog', name: 's' });
    if (repeatCountFlat) u.abilityModifiers = { [SpiritFlurryAbility.id]: { repeatCountFlat } };
    return u;
}

function strikes(u: Unit) {
    return normalizeAbilityTimingsToIntervals(resolveAbilityTimingEntries(SpiritFlurryAbility, u))
        .filter((it) => it.abilityPhase === AbilityPhase.Active);
}

describe('Spirit Flurry 0711', () => {
    it('strikes once per base angle by default', () => {
        expect(strikes(spirit())).toHaveLength(SPIRIT_FLURRY_ANGLES.length);
    });

    it('fits two extra strikes into the same total time', () => {
        const base = strikes(spirit());
        const more = strikes(spirit(2));
        expect(more).toHaveLength(SPIRIT_FLURRY_ANGLES.length + 2);
        expect(more[more.length - 1]!.end).toBeCloseTo(base[base.length - 1]!.end);
    });
});
