/**
 * Chapter 2 ("The Surface") Mission Map grid.
 * Main questline snakes across rows 0–1 (four columns); dedicated side quests sit on their own
 * row below a "Side Quests" divider.
 */

export const WOD_CH2_MAP_X_ORIGIN = 100;
export const WOD_CH2_MAP_COL_SPACING = 220;
export const WOD_CH2_MAP_Y_ORIGIN = 150;
export const WOD_CH2_MAP_ROW_SPACING = 150;

export const WOD_CH2_MAP_X_COL0 = WOD_CH2_MAP_X_ORIGIN;
export const WOD_CH2_MAP_X_COL1 = WOD_CH2_MAP_X_ORIGIN + WOD_CH2_MAP_COL_SPACING;
export const WOD_CH2_MAP_X_COL2 = WOD_CH2_MAP_X_ORIGIN + WOD_CH2_MAP_COL_SPACING * 2;
export const WOD_CH2_MAP_X_COL3 = WOD_CH2_MAP_X_ORIGIN + WOD_CH2_MAP_COL_SPACING * 3;
export const WOD_CH2_MAP_X_COL4 = WOD_CH2_MAP_X_ORIGIN + WOD_CH2_MAP_COL_SPACING * 4;

export const WOD_CH2_MAP_Y_ROW0 = WOD_CH2_MAP_Y_ORIGIN;
export const WOD_CH2_MAP_Y_ROW1 = WOD_CH2_MAP_Y_ORIGIN + WOD_CH2_MAP_ROW_SPACING;

/** "Side Quests" divider line, between the main questline and the side-quest row. */
export const WOD_CH2_MAP_Y_SIDE_QUEST_DIVIDER = WOD_CH2_MAP_Y_ROW1 + 100;
/** Side-quest row, below the divider (extra gap leaves room for the subheader). */
export const WOD_CH2_MAP_Y_SIDE_QUEST_ROW = WOD_CH2_MAP_Y_ROW1 + 200;
