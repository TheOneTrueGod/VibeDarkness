import { beforeAll, describe, expect, it } from 'vitest';
import '../../abilities/AbilityRegistry';
import { Effect } from '../effects/Effect';
import { DROPPED_WEAPON_KIND_SWORD, IMPROVISED_SWORD_ABILITY_ID } from '../../card_defs/10_armory_core/armoryConstants';
import { WEAPON_DISCARD_ARC_EFFECT_TYPE } from '../effect_defs/weaponEffects';
import {
    DEFAULT_WEAPON_TIP_OFFSET,
    getConjuredWeaponDefByTokenKind,
    registerConjuredWeapon,
} from '../conjuredWeapons/registry';
import { FieldObjectManager, type FieldObjectHost } from './FieldObjectManager';
import { DROPPED_WEAPON_ROTATION_STEPS } from './landing';
import { weaponCardArtUrl } from './weaponArt';
import { registerArmoryContent } from '../../card_defs/10_armory_core/register';

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

// Armory weapons and the turret sentry def are looked up at cast time.
beforeAll(() => registerArmoryContent());

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
        expect(Number(toss?.effectData?.restRotation)).toBeCloseTo(expected + DEFAULT_WEAPON_TIP_OFFSET);
    });
});

describe('conjured weapon art', () => {
    it('a non-Armory weapon leaves its own token kind, art url and tip offset', () => {
        const kind = 'test_spear';
        const url = '/test/spear.svg';
        registerConjuredWeapon({
            id: 'test_spear_weapon',
            conjureAbilityId: 'test_conjure',
            heldAbilityId: 'test_held',
            releaseAbilityId: 'test_release',
            tokenKind: kind,
            heldUses: 1,
            art: { url, tipOffsetRad: 0 },
        });
        const { host, effects } = hostReturning(0);
        const weapon = new FieldObjectManager().spawnDroppedWeapon(host, {
            originX: 0,
            originY: 0,
            kind,
            ownerUnitId: 'caster',
            teamId: 'player',
            abilityId: 'test_held',
        });
        expect(weapon.kind).toBe(kind);
        expect(getConjuredWeaponDefByTokenKind(weapon.kind)?.id).toBe('test_spear_weapon');
        expect(weaponCardArtUrl(weapon.kind)).toBe(url);
        const toss = effects.find((effect) => effect.effectType === WEAPON_DISCARD_ARC_EFFECT_TYPE);
        expect(toss?.effectData?.weaponKind).toBe(kind);
        expect(Number(toss?.effectData?.restRotation)).toBeCloseTo(weapon.facing);
    });

    it('the Armory sword token resolves to its card art', () => {
        expect(weaponCardArtUrl(DROPPED_WEAPON_KIND_SWORD)).toMatch(/chargeSword\.svg/);
    });
});
