import { ROUND_DURATION } from '../../../game/gameConstants';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

export const SHIELD_OF_LIGHT_ABILITY_ID = `${formatGroupId(AbilityGroupId.Light)}05`;

export const LIGHT_SHIELD_PREFIRE_TIME = 0.3;
export const LIGHT_SHIELD_ACTIVE_DURATION = 0.05;
export const LIGHT_SHIELD_COOLDOWN_DURATION = 0.45;
export const LIGHT_SHIELD_HP = 20;
export const LIGHT_SHIELD_DURATION_ROUNDS = 1;
/** Undamaged shield fades to 0 across LIGHT_SHIELD_DURATION_ROUNDS of battle time. */
export const LIGHT_SHIELD_DRAIN_PER_SECOND =
    LIGHT_SHIELD_HP / (LIGHT_SHIELD_DURATION_ROUNDS * ROUND_DURATION);
export const LIGHT_SHIELD_LIGHT_COST = 2;
/** Yellow shell / juice shared by the buff visual and cast VFX. */
export const LIGHT_SHIELD_COLOR = 0xffe066;
export const LIGHT_SHIELD_COLOR_INNER = 0xfff1a8;

/** Blinding Flare research — extra Light on the primary cost. */
export const LIGHT_SHIELD_FLARE_RESOURCE_COST_ADD = 1;
export const LIGHT_SHIELD_FLARE_DAMAGE = 8;
export const LIGHT_SHIELD_FLARE_KNOCKBACK_TIER = 2;
export const LIGHT_SHIELD_FLARE_RADIUS = 55;
export const LIGHT_SHIELD_FLARE_TAG = 'LightShieldFlare';
