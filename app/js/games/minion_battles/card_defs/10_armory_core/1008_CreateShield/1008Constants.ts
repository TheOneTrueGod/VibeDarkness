/** Create Shield tuning. */
import { ARMORY_CREATE_CHARGE_COST } from '../armoryConstants';

/** How long Create Shield keeps blocking, in seconds. */
export const CREATE_SHIELD_CAST_DURATION = 3;
/** Spinning bucklers, then this card becomes the held shield. Shorter than the block. */
export const CREATE_SHIELD_CONJURE_DURATION = 1;
/**
 * Seconds into the block when the caster may use another ability.
 * Passing keeps the buckler up for the rest of {@link CREATE_SHIELD_CAST_DURATION}.
 */
export const CREATE_SHIELD_INTERRUPT_AT = CREATE_SHIELD_CAST_DURATION / 2;
/** Charge granted the first time a Create Shield cast blocks an attack. Equal to the cost, so a block refunds it. */
export const SHIELD_BLOCK_CHARGE_GRANT = ARMORY_CREATE_CHARGE_COST;
export const CREATE_SHIELD_AIM_LABEL = 'Direction to block';
