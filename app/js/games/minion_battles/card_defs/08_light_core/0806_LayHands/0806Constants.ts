import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

export const LAY_HANDS_ABILITY_ID = `${formatGroupId(AbilityGroupId.Light)}06`;

export const LAY_HANDS_PUNCH_DAMAGE = 8;
export const LAY_HANDS_EXPLOSION_DAMAGE = 6;
/** Explosion radius around the locked emitter (px). Matches Blinding Flare. */
export const LAY_HANDS_EXPLOSION_RADIUS = 55;
/** Punch lunge is 10 px; Lay Hands triples it. */
export const LAY_HANDS_LUNGE_DISTANCE = 30;
export const LAY_HANDS_RANGE = 30;
export const LAY_HANDS_THICKNESS = 20;
export const LAY_HANDS_MAX_USES = 4;

export const LAY_HANDS_WINDUP = 0.2;
export const LAY_HANDS_ACTIVE = 0.2;
export const LAY_HANDS_COOLDOWN = 0.8;
/** Fraction of the strike window at which both the punch and the explosion land. */
export const LAY_HANDS_IMPACT_AT = 0.75;

/** Juice palette: warm gold with a white-hot core. */
export const LAY_HANDS_COLOR = 0xffe066;
export const LAY_HANDS_COLOR_CORE = 0xfffbe6;
export const LAY_HANDS_MOTE_COUNT = 3;
export const LAY_HANDS_MOTE_DURATION = 0.2;
