import { describe, expect, it } from 'vitest';
import { BOTTOM_BAND_HEIGHT_PX } from '../../../../../components/battleUILayout/BattleUISlotLayout';
import {
    ABILITY_CARD_LIFT_PADDING_Y_PX,
    ABILITY_SLOT_HEIGHT_PX,
    BATTLE_BOTTOM_ROW_PADDING_Y_PX,
    PLAQUE_MIN_HEIGHT_PX,
    TURN_INDICATOR_GAP_Y_PX,
} from './battleBottomBarLayout';

describe('battleBottomBarLayout', () => {
    it('keeps 150px battle cards and hover-lift padding within the bottom band', () => {
        expect(BATTLE_BOTTOM_ROW_PADDING_Y_PX).toBe(8);
        expect(TURN_INDICATOR_GAP_Y_PX).toBe(8);
        expect(ABILITY_CARD_LIFT_PADDING_Y_PX).toBe(8);
        expect(ABILITY_SLOT_HEIGHT_PX).toBe(150);
        expect(
            BATTLE_BOTTOM_ROW_PADDING_Y_PX
            + PLAQUE_MIN_HEIGHT_PX
            + TURN_INDICATOR_GAP_Y_PX
            + ABILITY_CARD_LIFT_PADDING_Y_PX
            + ABILITY_SLOT_HEIGHT_PX
            + ABILITY_CARD_LIFT_PADDING_Y_PX
            + BATTLE_BOTTOM_ROW_PADDING_Y_PX,
        ).toBeLessThanOrEqual(BOTTOM_BAND_HEIGHT_PX);
    });
});
