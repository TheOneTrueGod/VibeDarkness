/** Create Shield tuning. */
import { ARMORY_CREATE_CHARGE_COST, CREATE_SWORD_CAST_DURATION } from '../armoryConstants';

/** How long the buckler's orbit plays: the same length as the other conjures. */
export const CREATE_SHIELD_ORBIT_DURATION = CREATE_SWORD_CAST_DURATION;
/** Create Shield blocks for twice the other conjures' length. The orbit plays once, then the block continues. */
export const CREATE_SHIELD_CAST_DURATION = 2 * CREATE_SWORD_CAST_DURATION;
/** Charge granted the first time a Create Shield cast blocks an attack. Equal to the cost, so a block refunds it. */
export const SHIELD_BLOCK_CHARGE_GRANT = ARMORY_CREATE_CHARGE_COST;
export const CREATE_SHIELD_AIM_LABEL = 'Direction to block';
