/**
 * Shared swing feel for swords and maces. The prose is in `researchTrees/trees/Weapons.md`.
 * Abilities import these instead of repeating the band widths.
 */
import { DEFAULT_MELEE_LUNGE } from '../game/units/unit_defs/unitConstants';

/** Hit-band thickness along the aim for a mace swing. */
export const MACE_SWING_THICKNESS = 26;
/** How much thinner a sword's hit band is than a mace's. */
export const SWORD_SWING_THICKNESS_REDUCTION = 6;
export const SWORD_SWING_THICKNESS = MACE_SWING_THICKNESS - SWORD_SWING_THICKNESS_REDUCTION;
/** Extra step past the shared melee lunge, so the thinner sword band still connects. */
export const SWORD_SWING_LUNGE_BONUS = 8;
export const SWORD_SWING_LUNGE = DEFAULT_MELEE_LUNGE + SWORD_SWING_LUNGE_BONUS;
