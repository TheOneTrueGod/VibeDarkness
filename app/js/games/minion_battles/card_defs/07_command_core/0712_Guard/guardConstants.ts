/** Guard (0712) numbers, shared by the card and its return listener. */
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

export const GUARD_ABILITY_ID = `${formatGroupId(AbilityGroupId.Command)}12`;
/** `reason` the spirit is exiled with; the return listener filters `unit_returned` on it. */
export const GUARD_EXILE_REASON = 'guard';
/** HP the guard shield refills to after every hit: each hit is reduced by this much. */
export const GUARD_SHIELD_FLOOR = 2;
/** How long the shield (and the spirit's absence) lasts, in world seconds. */
export const GUARD_SECONDS = 10;
/** Max distance (px) from the caster to the guarded unit. */
export const GUARD_RANGE = 300;
/** Kinship the caster recovers over the guard's duration (whole points, evenly spaced). */
export const GUARD_KINSHIP_RECOVERY = 2;
/** Wall-time fade-in of the spirit as it re-emerges. */
export const GUARD_FADE_IN_MS = 300;
