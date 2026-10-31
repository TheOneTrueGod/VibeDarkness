/** Create Shield tuning. */
import { ARMORY_ABILITY_CHARGE_COST, CREATE_SWORD_CAST_DURATION } from '../armoryConstants';

/** Create Shield blocks for the same length as the other conjures. */
export const CREATE_SHIELD_CAST_DURATION = CREATE_SWORD_CAST_DURATION;
/** Charge granted the first time a Create Shield cast blocks an attack. Equal to the cost, so a block refunds it. */
export const SHIELD_BLOCK_CHARGE_GRANT = ARMORY_ABILITY_CHARGE_COST;
export const CREATE_SHIELD_AIM_LABEL = 'Direction to block';
