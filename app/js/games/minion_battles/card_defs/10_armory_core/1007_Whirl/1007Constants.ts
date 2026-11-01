/** Whirl tuning. */
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { SWING_BAT_BASE_DAMAGE } from '../../0115_SwingBat/0115Ability';

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
/** Impact ring is drawn at the outer edge. */
export const MACE_WHIRL_VISUAL_RADIUS = MACE_WHIRL_OUTER_RADIUS;
/** Hard stun applied to each enemy Whirl damages. */
export const MACE_WHIRL_STUN_SECONDS = 2;
export const MACE_WHIRL_EFFECT_DURATION = 0.35;
