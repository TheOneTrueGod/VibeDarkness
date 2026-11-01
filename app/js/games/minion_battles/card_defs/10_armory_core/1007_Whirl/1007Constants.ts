/** Whirl tuning. */
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { SWING_BAT_BASE_DAMAGE } from '../../0115_SwingBat/0115Ability';
import { FIXED_DT } from '../../../game/gameConstants';

/** Half of Swing Mace's hit: Whirl also lands at every dropped mace. */
export const WHIRL_DAMAGE = SWING_BAT_BASE_DAMAGE / 2;

/** Enemies a Whirl can strike. */
export const MACE_WHIRL_MAX_TARGETS = 5;
/**
 * How far the inner edge sits past the caster's body. Units wholly inside that hole are missed.
 */
export const MACE_WHIRL_INNER_CLEARANCE = 9;
/** Outer edge of the whirl ring: the farthest the swing reaches. */
export const MACE_WHIRL_OUTER_RADIUS = DEFAULT_UNIT_RADIUS * 3;
/** Hard stun applied to each enemy Whirl damages. */
export const MACE_WHIRL_STUN_SECONDS = 2;
/** Arc segments in one full turn of the whirlwind. One is laid down each tick. */
export const MACE_WHIRL_SEGMENTS = 12;
export const MACE_WHIRL_SEGMENT_SECONDS = FIXED_DT;
/** How long each segment stays drawn while it fades: ten ticks. */
export const MACE_WHIRL_SEGMENT_LIFETIME = 10 * FIXED_DT;
