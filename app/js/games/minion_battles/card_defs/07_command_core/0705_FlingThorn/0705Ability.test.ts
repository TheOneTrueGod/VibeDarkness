import { describe, expect, it } from 'vitest';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { FLING_THORN_ABILITY_ID, FLING_THORN_DAMAGE, FLING_THORN_MAX_DISTANCE } from './0705Ability';

describe('Fling Thorn 0705', () => {
    it('is registered with lanternite-like range and 5 damage', () => {
        const ability = getAbility(FLING_THORN_ABILITY_ID);
        expect(ability).toBeDefined();
        expect(ability!.name).toBe('Fling Thorn');
        expect(ability!.aiSettings?.maxRange).toBe(FLING_THORN_MAX_DISTANCE);
        expect(ability!.aiSettings?.priority).toBe(1);
        expect(FLING_THORN_DAMAGE).toBe(5);
    });
});
