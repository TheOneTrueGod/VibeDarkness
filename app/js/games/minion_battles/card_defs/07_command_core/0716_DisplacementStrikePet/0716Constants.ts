/**
 * Displacement Strike constants shared by the ability, the card (0715) and the Command Core research tree.
 * Kept free of engine imports so the research tree can read them without pulling in the ability module.
 */
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

export const DISPLACEMENT_STRIKE_PET_ABILITY_ID = `${formatGroupId(AbilityGroupId.Command)}16`;
/** The player card that commands it (0715). */
export const DISPLACEMENT_STRIKE_CARD_ID = `${formatGroupId(AbilityGroupId.Command)}15`;
export const DISPLACEMENT_STRIKE_CLONE_COUNT = 3;
/** Seconds each clone lasts (then it finishes its cast, if any, and fades). */
export const DISPLACEMENT_STRIKE_CLONE_SECONDS = 6;
