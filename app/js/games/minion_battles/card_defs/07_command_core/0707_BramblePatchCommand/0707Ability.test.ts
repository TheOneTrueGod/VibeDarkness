import { describe, expect, it } from 'vitest';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { getInteractiveTargetDefsFromTimings } from '../../../abilities/targeting';
import { isConfirmRadiusTargetDef } from '../../../abilities/timingTargetDef';
import {
    BRAMBLE_PATCH_RADIUS,
    BRAMBLE_PATCH_SHAPE,
    BRAMBLE_PATCH_WINDUP,
    bramblePatchShape,
} from '../0706_BramblePatch/0706Ability';
import type { Unit } from '../../../game/units/Unit';
import { BRAMBLE_PATCH_CONFIRM_AT } from './0707Ability';

describe('Bramble Patch command 0707', () => {
    it('pauses ITS with a tile confirm before the pet slams', () => {
        const ability = getAbility('0707');
        expect(ability).toBeDefined();
        const defs = getInteractiveTargetDefsFromTimings(ability!);
        expect(defs).toHaveLength(1);
        expect(isConfirmRadiusTargetDef(defs[0]!)).toBe(true);
        if (isConfirmRadiusTargetDef(defs[0]!)) {
            expect(defs[0].radius).toBe(BRAMBLE_PATCH_RADIUS);
            expect(defs[0].tileShape).toBe(BRAMBLE_PATCH_SHAPE);
            expect(defs[0].label).toBe('Confirm radius');
        }
        const confirmInterval = ability!.abilityTimings.find(
            (t) => 'id' in t && t.id === 'confirm',
        );
        expect(confirmInterval && 'start' in confirmInterval && confirmInterval.start).toBe(
            BRAMBLE_PATCH_CONFIRM_AT,
        );
        expect(BRAMBLE_PATCH_CONFIRM_AT).toBeLessThan(BRAMBLE_PATCH_WINDUP);
    });

    it('uses pet abilitySource', () => {
        const ability = getAbility('0707');
        expect(ability?.abilitySource).toEqual({ type: 'pet', selector: 'nearest', requireFree: true });
    });

    it('recovers one use per roundCharge (not stamina)', () => {
        const ability = getAbility('0707');
        expect(ability?.recoveries).toEqual([
            { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
        ]);
    });

    it('confirms a 5x5 square when the owner has Overgrowth', () => {
        const ability = getAbility('0707')!;
        const owner = { abilityModifiers: { '0706': { tileAreaRadiusFlat: 1 } } } as unknown as Unit;
        const defs = getInteractiveTargetDefsFromTimings(ability, owner);
        expect(isConfirmRadiusTargetDef(defs[0]!) && defs[0].tileShape).toBe(bramblePatchShape(2));
        expect(bramblePatchShape(2)).toHaveLength(25);
        expect(BRAMBLE_PATCH_SHAPE).toHaveLength(9);
    });
});
