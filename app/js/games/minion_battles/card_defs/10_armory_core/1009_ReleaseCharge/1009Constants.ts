/** Release Charge tuning. The cone, stun and timings are Cone of Light's. */
import { CONE_OF_LIGHT_DAMAGE, CONE_OF_LIGHT_RANGE } from '../../0121_ConeOfLight/0121Ability';

export const RELEASE_CHARGE_DAMAGE = CONE_OF_LIGHT_DAMAGE - 8;
/** Radius of the circular echo burst at each dropped buckler: half the cone's reach. */
export const RELEASE_CHARGE_ECHO_RADIUS = CONE_OF_LIGHT_RANGE / 2;
