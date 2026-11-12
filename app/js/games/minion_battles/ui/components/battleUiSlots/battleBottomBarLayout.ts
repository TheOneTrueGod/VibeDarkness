/** Padding above the turn indicator and below the ability cards. */
export const BATTLE_BOTTOM_ROW_PADDING_Y_PX = 8;
/** Gap between the turn-indicator plaque and the ability cards. */
export const TURN_INDICATOR_GAP_Y_PX = 8;
/** Tight hexagon body; inner text/ITS row + padding must fit this height. */
export const PLAQUE_MIN_HEIGHT_PX = 32;
export const PLAQUE_BORDER_THICKNESS_PX = 2;
export const PLAQUE_INNER_PADDING_Y_PX = 4;
export const PLAQUE_INNER_MIN_HEIGHT_PX = PLAQUE_MIN_HEIGHT_PX - PLAQUE_BORDER_THICKNESS_PX * 2;

/** Battle ability-card height. Must fit under the plaque + 8px indicator gaps in the bottom band. */
export const ABILITY_SLOT_HEIGHT_PX = 150;
/**
 * Padding above and below the card row so hover (`-translate-y-1`) and select
 * (`-translate-y-2`) lifts are not clipped by the hand scroller.
 */
export const ABILITY_CARD_LIFT_PADDING_Y_PX = 8;
/** Always-visible per-cast mode strip rendered under cards that declare `abilityModes`. */
export const ABILITY_MODE_STRIP_HEIGHT_PX = 18;
/**
 * Point-to-point size of one use diamond. Half of it hangs below the card, so it matches the
 * lift padding and is not clipped by the hand row.
 */
export const ABILITY_USE_DIAMOND_SIZE_PX = ABILITY_CARD_LIFT_PADDING_Y_PX * 2;
/** Space between use diamonds along the card's bottom edge. */
export const ABILITY_USE_DIAMOND_GAP_PX = 4;
/** Smallest a diamond shrinks to when a card has many uses. */
export const ABILITY_USE_DIAMOND_MIN_SIZE_PX = 8;
/** Horizontal inset so a full row of diamonds stays inside the card width. */
export const ABILITY_USE_DIAMOND_ROW_INSET_PX = 12;
/** Room under the card so the hanging half of a use diamond clears the mode strip. */
export const ABILITY_MODE_STRIP_GAP_PX = ABILITY_USE_DIAMOND_SIZE_PX / 2;

/** Point-to-point diamond size for `count` uses on a card `cardWidthPx` wide. */
export function abilityUseDiamondSizePx(count: number, cardWidthPx: number): number {
    const n = Math.max(1, count);
    const gaps = (n - 1) * ABILITY_USE_DIAMOND_GAP_PX;
    const available = cardWidthPx - ABILITY_USE_DIAMOND_ROW_INSET_PX - gaps;
    const fit = Math.floor(available / n);
    return Math.min(ABILITY_USE_DIAMOND_SIZE_PX, Math.max(ABILITY_USE_DIAMOND_MIN_SIZE_PX, fit));
}

/** Character-select / Quest Prep cards share the battle chrome but keep the older band budget. */
export const ABILITY_SLOT_PREP_HEIGHT_PX = 126;
