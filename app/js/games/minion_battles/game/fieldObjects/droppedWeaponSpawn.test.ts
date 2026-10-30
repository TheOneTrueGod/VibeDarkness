import { describe, expect, it } from 'vitest';
import '../../abilities/AbilityRegistry';
import { Effect } from '../effects/Effect';
import {
    DROPPED_WEAPON_KIND_SWORD,
    DROPPED_WEAPON_ROTATION_STEPS,
    IMPROVISED_SWORD_ABILITY_ID,
    SWORD_CARD_TIP_OFFSET,
    WEAPON_DISCARD_ARC_EFFECT_TYPE,
} from '../../card_defs/10_armory_core/armoryConstants';
import { FieldObjectManager, type FieldObjectHost } from './FieldObjectManager';

function hostReturning(step: number): { host: FieldObjectHost; effects: Effect[] } {
    const effects: Effect[] = [];
    const host: FieldObjectHost = {
        gameTime: 0,
        units: [],
        addEffect: (effect) => { effects.push(effect); },
        addProjectile: () => {},
        generateRandomInteger: () => step,
    };
    return { host, effects };
}

describe('dropped weapon rest angle', () => {
    it('uses the battle rng for the token rotation and the flight lands on that angle', () => {
        const step = DROPPED_WEAPON_ROTATION_STEPS / 4;
        const { host, effects } = hostReturning(step);
        const weapon = new FieldObjectManager().spawnDroppedWeapon(host, {
            originX: 0,
            originY: 0,
            kind: DROPPED_WEAPON_KIND_SWORD,
            ownerUnitId: 'caster',
            teamId: 'player',
            abilityId: IMPROVISED_SWORD_ABILITY_ID,
        });
        const expected = (step / DROPPED_WEAPON_ROTATION_STEPS) * Math.PI * 2;
        expect(weapon.facing).toBeCloseTo(expected);
        const toss = effects.find((effect) => effect.effectType === WEAPON_DISCARD_ARC_EFFECT_TYPE);
        expect(Number(toss?.effectData?.restRotation)).toBeCloseTo(expected + SWORD_CARD_TIP_OFFSET);
    });
});
