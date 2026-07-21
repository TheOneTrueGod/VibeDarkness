import { describe, expect, it } from 'vitest';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { getInteractiveTargetDefsFromTimings } from '../../../abilities/targeting';
import { isConfirmRadiusTargetDef } from '../../../abilities/timingTargetDef';
import {
    BRAMBLE_PATCH_RADIUS,
    BRAMBLE_PATCH_WINDUP,
} from '../0706_BramblePatch/0706Ability';

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
            BRAMBLE_PATCH_WINDUP,
        );
    });

    it('uses pet abilitySource', () => {
        const ability = getAbility('0707');
        expect(ability?.abilitySource).toEqual({ type: 'pet', selector: 'nearest' });
    });

    it('recovers one use per roundCharge (not stamina)', () => {
        const ability = getAbility('0707');
        expect(ability?.recoveries).toEqual([
            { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
        ]);
    });
});
