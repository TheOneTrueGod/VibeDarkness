/** Throw Shield tuning. The windup, aim and recovery are Throw Sword's. */
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { DEFAULT_BULLET_TRAIL_RADIUS } from '../../../game/effect_defs/bulletTrail';
import {
    THROW_SWORD_ACTIVE_END,
    THROW_SWORD_AIM_LABEL,
    THROW_SWORD_COOLDOWN_END,
    THROW_SWORD_WINDUP_END,
} from '../1003_ThrowSword/1003Constants';

/** Throw Shield uses the same windup, aim, and recovery as Throw Sword. */
export const THROW_SHIELD_WINDUP_END = THROW_SWORD_WINDUP_END;
export const THROW_SHIELD_ACTIVE_END = THROW_SWORD_ACTIVE_END;
export const THROW_SHIELD_COOLDOWN_END = THROW_SWORD_COOLDOWN_END;
export const THROW_SHIELD_DAMAGE = 6;
/** The buckler strikes once, then one more enemy, then falls. */
export const THROW_SHIELD_HIT_COUNT = 2;
/** How far the thrown buckler looks for its second enemy, in pixels. */
export const THROW_SHIELD_BOUNCE_RANGE_TILES = 3;
export const THROW_SHIELD_BOUNCE_RANGE = THROW_SHIELD_BOUNCE_RANGE_TILES * CELL_SIZE;
/** One pixel thicker than a normal bullet trail. */
export const THROW_SHIELD_TRAIL_RADIUS = DEFAULT_BULLET_TRAIL_RADIUS + 1;
/** Drawn size of the thrown buckler, relative to the card art. */
export const THROW_SHIELD_SPRITE_SCALE = 0.4;
/** Hit radius of the thrown buckler, in pixels. */
export const THROW_SHIELD_HIT_RADIUS = 10;
export const THROW_SHIELD_AIM_LABEL = THROW_SWORD_AIM_LABEL;
