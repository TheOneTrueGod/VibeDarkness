import { describe, expect, it } from 'vitest';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { CARD_DEF_MAP } from '../../index';
import { getUnitDefEntry } from '../../../game/units/unit_defs/unitDef';
import { SLIME_SHOT_MAX_DISTANCE, SLIME_SHOT_PROJECTILE_SPEED, SlimeShotAbility } from '../../0001_SlimeShot/0001Ability';
import { ENEMY_DISPLACER_SPIRIT } from '../../../constants/enemyConstants';
import { SLIME } from '../../../game/units/dark_animals/slime';
import { Unit } from '../../../game/units/Unit';
import {
    DISPLACER_BOLT_ID,
    DISPLACER_BOLT_LIFETIME_SEC,
    DISPLACER_BOLT_SPEED,
    DISPLACER_BOLT_TRAVEL_DISTANCE,
    DisplacerBoltAbility,
} from './0017Ability';

describe('DisplacerBolt', () => {
    it('is registered as an ability and card', () => {
        expect(getAbility(DISPLACER_BOLT_ID)).toBe(DisplacerBoltAbility);
        expect(CARD_DEF_MAP.get(DISPLACER_BOLT_ID)).toBeDefined();
    });

    it('keeps the slime targeting / AI range', () => {
        expect(DisplacerBoltAbility.aiSettings?.minRange).toBe(SlimeShotAbility.aiSettings?.minRange);
        expect(DisplacerBoltAbility.aiSettings?.maxRange).toBe(SlimeShotAbility.aiSettings?.maxRange);
        const caster = new Unit({ x: 0, y: 0, hp: 1, speed: 1, teamId: 'enemy', ownerId: 'ai', characterId: 'displacer_spirit', name: 'd' });
        expect(DisplacerBoltAbility.getRange!(caster)).toEqual(SlimeShotAbility.getRange!(caster));
        expect(ENEMY_DISPLACER_SPIRIT.aiSettings).toEqual(SLIME.aiSettings);
    });

    it('travels twice the targeting range at a modestly higher speed', () => {
        expect(DISPLACER_BOLT_TRAVEL_DISTANCE).toBe(SLIME_SHOT_MAX_DISTANCE * 2);
        expect(DISPLACER_BOLT_SPEED).toBeGreaterThan(SLIME_SHOT_PROJECTILE_SPEED);
        expect(DISPLACER_BOLT_SPEED / SLIME_SHOT_PROJECTILE_SPEED).toBeCloseTo(1.2);
        expect(DISPLACER_BOLT_LIFETIME_SEC * DISPLACER_BOLT_SPEED).toBeCloseTo(DISPLACER_BOLT_TRAVEL_DISTANCE);
    });
});

describe('displacer_spirit unit def', () => {
    it('exists, is small sized, and moves faster than the slime', () => {
        const def = getUnitDefEntry('displacer_spirit');
        const slime = getUnitDefEntry('slime');
        expect(def).toBeDefined();
        expect(def!.size).toBe('Small');
        expect(def!.speed!).toBeGreaterThan(slime!.speed!);
        expect(ENEMY_DISPLACER_SPIRIT.abilities).toEqual([DISPLACER_BOLT_ID, '0018', '0019', '0020']);
    });
});
