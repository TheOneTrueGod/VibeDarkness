import { describe, expect, it } from 'vitest';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { FLING_THORN_ABILITY_ID, FLING_THORN_DAMAGE, FLING_THORN_SPREAD } from './0705Ability';

describe('Fling Thorn 0705', () => {
    it('is a pet-only ordered shot: no aiSettings, restored by commandCharge', () => {
        const ability = getAbility(FLING_THORN_ABILITY_ID);
        expect(ability).toBeDefined();
        expect(ability!.name).toBe('Fling Thorn');
        expect(ability!.aiSettings).toBeUndefined();
        expect(ability!.recoveries).toEqual([{ chargeType: 'commandCharge', chargesPerRecovery: 1, usesRecovered: 1 }]);
        expect(FLING_THORN_DAMAGE).toBe(2);
        expect(FLING_THORN_SPREAD).toHaveLength(5);
    });
});
