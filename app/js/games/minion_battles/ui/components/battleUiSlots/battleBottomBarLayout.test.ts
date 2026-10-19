import { describe, expect, it } from 'vitest';
import { BOTTOM_BAND_HEIGHT_PX } from '../../../../../components/battleUILayout/BattleUISlotLayout';
import {
    ABILITY_CARD_LIFT_PADDING_Y_PX,
    ABILITY_MODE_STRIP_GAP_PX,
    ABILITY_MODE_STRIP_HEIGHT_PX,
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

    it('fits card body + gap + mode strip in the full card height, with room for icon and name', () => {
        const bodyHeight = ABILITY_SLOT_HEIGHT_PX - ABILITY_MODE_STRIP_GAP_PX - ABILITY_MODE_STRIP_HEIGHT_PX;
        expect(bodyHeight + ABILITY_MODE_STRIP_GAP_PX + ABILITY_MODE_STRIP_HEIGHT_PX).toBe(ABILITY_SLOT_HEIGHT_PX);
        // 56px icon + 2 name lines (12px * 1.25) + uses badge (22px) + border/padding (12px).
        expect(bodyHeight).toBeGreaterThanOrEqual(56 + 2 * 12 * 1.25 + 22 + 12);
    });
});
