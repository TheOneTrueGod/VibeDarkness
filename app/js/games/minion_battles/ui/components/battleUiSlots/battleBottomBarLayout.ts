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

/** Character-select / Quest Prep cards share the battle chrome but keep the older band budget. */
export const ABILITY_SLOT_PREP_HEIGHT_PX = 126;
