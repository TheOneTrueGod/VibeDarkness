import { describe, expect, it } from 'vitest';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { getInteractiveTargetDefsFromTimings } from '../../../abilities/targeting';
import { isConfirmRadiusTargetDef } from '../../../abilities/timingTargetDef';
import { BRAMBLE_PATCH_RADIUS } from '../0706_BramblePatch/0706Ability';
import { BRAMBLE_PATCH_COMMAND_WINDUP } from './0707Ability';

describe('Bramble Patch command 0707', () => {
    it('pauses ITS with confirmRadius after windup', () => {
        const ability = getAbility('0707');
        expect(ability).toBeDefined();
        const defs = getInteractiveTargetDefsFromTimings(ability!);
        expect(defs).toHaveLength(1);
        expect(isConfirmRadiusTargetDef(defs[0]!)).toBe(true);
        if (isConfirmRadiusTargetDef(defs[0]!)) {
            expect(defs[0].radius).toBe(BRAMBLE_PATCH_RADIUS);
            expect(defs[0].label).toBe('Confirm radius');
        }
        const confirmInterval = ability!.abilityTimings.find(
            (t) => 'id' in t && t.id === 'confirm',
        );
        expect(confirmInterval && 'start' in confirmInterval && confirmInterval.start).toBe(
            BRAMBLE_PATCH_COMMAND_WINDUP,
        );
    });

    it('uses pet abilitySource', () => {
        const ability = getAbility('0707');
        expect(ability?.abilitySource).toEqual({ type: 'pet', selector: 'nearest' });
    });
});
