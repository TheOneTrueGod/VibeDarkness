/**
 * Deploy Turret tuning. `register.ts` builds the turret's `DeployableDef` from these numbers.
 * Turret render geometry and colours live next to the painter:
 * `game/effect_defs/turretDeployPose.ts` and `turretDeployDraw.ts`.
 */
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { ROUND_DURATION } from '../../../game/gameConstants';
import { THROW_RANGE } from '../../throwNumbers';

export const TURRET_PLACE_RANGE_TILES = 3;
export const TURRET_PLACE_RANGE = TURRET_PLACE_RANGE_TILES * CELL_SIZE;
/** Full cone is 45 degrees. */
export const TURRET_CONE_HALF_ANGLE_RAD = Math.PI / 8;
export const TURRET_SHOT_DAMAGE = 4;
export const TURRET_SHOT_COUNT = 4;
export const TURRET_FIRST_SHOT_DELAY = 0.4;
/** World-time length of the turret's ranged-attack clip. It finishes well before the next shot. */
export const TURRET_RANGED_ATTACK_DURATION = TURRET_FIRST_SHOT_DELAY;
export const TURRET_SHOT_INTERVAL = ROUND_DURATION / TURRET_SHOT_COUNT;
export const TURRET_LIFETIME = ROUND_DURATION;
/** Shot reach. Same distance Throw Rock flies. */
export const TURRET_SHOT_RANGE = THROW_RANGE;

/**
 * Time for the delivery projectile to cross {@link TURRET_PLACE_RANGE}.
 * Closer tiles arrive sooner; the speed is constant.
 */
export const TURRET_FLIGHT_DURATION = 0.22;
/** Full turns the folded turret spins while crossing {@link TURRET_PLACE_RANGE}. */
export const TURRET_DEPLOY_SPIN_TURNS = 2;
/** Degrees in one full spin. `Projectile.rotationSpeed` is degrees per second. */
const DEGREES_PER_TURN = 360;
/** Constant speed of the folded turret, in pixels per second. */
export const TURRET_DEPLOY_SPEED = TURRET_PLACE_RANGE / TURRET_FLIGHT_DURATION;
/** Spin rate of the folded turret, in degrees per second. */
export const TURRET_DEPLOY_SPIN_DEGREES_PER_SEC =
    (TURRET_DEPLOY_SPIN_TURNS * DEGREES_PER_TURN) / TURRET_FLIGHT_DURATION;
/** Footprint fill while choosing a tile or a facing. */
export const TURRET_BODY_PREVIEW_ALPHA = 0.55;
/**
 * Pixi scale for a turret round, relative to the 64px rock frames.
 * Smaller than Throw Rock; the bullet trail is what reads at this size.
 */
export const TURRET_SHOT_SPRITE_SCALE = 0.08;
/** Hit radius of a turret round, in pixels. Matches the tiny sprite. */
export const TURRET_SHOT_HIT_RADIUS = 2;

export const TURRET_PLACE_LABEL = 'Place';
export const TURRET_AIM_LABEL = 'Facing';

/** Deploy Turret commit windows after both picks. */
export const TURRET_PLACE_WINDOW_END = 0.05;
export const TURRET_AIM_WINDOW_END = 0.1;
export const TURRET_DEPLOY_WINDOW_END = 0.2;
export const TURRET_COOLDOWN_END = 0.45;
/** Minimum aim offset so the facing vector is never zero. */
export const TURRET_AIM_MIN_DISTANCE = 8;
