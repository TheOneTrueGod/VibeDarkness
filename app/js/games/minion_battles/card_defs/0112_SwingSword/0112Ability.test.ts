import '../../abilities/AbilityRegistry';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MELEE_LUNGE } from '../../game/units/unit_defs/unitConstants';
import {
    SWING_SWORD_HITBOX,
    SWING_SWORD_LUNGE,
    SWING_SWORD_THICKNESS,
    SwingSwordAbility,
} from './0112Ability';

describe('Swing Sword', () => {
    it('uses a thinner hit band and a longer lunge than the shared melee step', () => {
        expect(SWING_SWORD_HITBOX.thickness).toBe(SWING_SWORD_THICKNESS);
        expect(SWING_SWORD_LUNGE).toBeGreaterThan(DEFAULT_MELEE_LUNGE);
        expect(SwingSwordAbility.lunge?.distance).toBe(SWING_SWORD_LUNGE);
        expect(SwingSwordAbility.aiSettings?.maxRange).toBe(SWING_SWORD_HITBOX.maxRange + SWING_SWORD_LUNGE);
    });
});