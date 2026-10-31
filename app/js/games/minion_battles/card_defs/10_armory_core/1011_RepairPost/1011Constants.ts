/**
 * Repair Post tuning. `register.ts` builds the post's `DeployableDef` from these numbers.
 * Its drawing lives with the painter: `game/effect_defs/repairPostPose.ts` and `deployablePainters.ts`.
 */
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { ROUND_DURATION } from '../../../game/gameConstants';
import { REPAIR_POST_FOLDED_CORE_RADIUS } from '../../../game/effect_defs/repairPostPose';
import {
    TURRET_DEPLOY_SPEED,
    TURRET_DEPLOY_SPIN_DEGREES_PER_SEC,
    TURRET_PLACE_RANGE,
    TURRET_PLACE_RANGE_TILES,
} from '../1004_DeployTurret/1004Constants';

/** Placed the same distance away as the turret, on the same kind of tile. */
export const REPAIR_POST_PLACE_RANGE_TILES = TURRET_PLACE_RANGE_TILES;
export const REPAIR_POST_PLACE_RANGE = TURRET_PLACE_RANGE;
/** Pulses before the post leaves: one each quarter round. */
export const REPAIR_POST_PULSES = 4;
export const REPAIR_POST_PULSE_INTERVAL = ROUND_DURATION / REPAIR_POST_PULSES;
/** First pulse shortly after landing, the same delay as the turret's first shot. */
export const REPAIR_POST_FIRST_PULSE_DELAY = 0.4;
export const REPAIR_POST_LIFETIME = ROUND_DURATION;
/** Reach of each pulse, in pixels, to the ally's centre. */
export const REPAIR_POST_HEAL_RADIUS = 150;
export const REPAIR_POST_HEAL_RADIUS_TILES = REPAIR_POST_HEAL_RADIUS / CELL_SIZE;
/** HP each ally regains per pulse. */
export const REPAIR_POST_HEAL = 3;
/** Pulse ring, inner wave first. Heal green, matching the heal numbers. */
export const REPAIR_POST_PULSE_COLORS = [0x86efac, 0x4ade80, 0x22c55e] as const;
export const REPAIR_POST_PULSE_DURATION = 0.6;
/** World-time length of the arcs' burst-and-retract clip on each pulse. */
export const REPAIR_POST_BURST_DURATION = 1.2;

/** Same flight as the folded turret. */
export const REPAIR_POST_DEPLOY_SPEED = TURRET_DEPLOY_SPEED;
export const REPAIR_POST_DEPLOY_SPIN_DEGREES_PER_SEC = TURRET_DEPLOY_SPIN_DEGREES_PER_SEC;
export const REPAIR_POST_DELIVERY_BODY_RADIUS = REPAIR_POST_FOLDED_CORE_RADIUS;

/** Placement preview: the heal reach, faintly. */
export const REPAIR_POST_PREVIEW_COLOR = 0x22c55e;
export const REPAIR_POST_PREVIEW_ALPHA = 0.14;

export const REPAIR_POST_PLACE_LABEL = 'Place';

/** Cast windows after the pick. */
export const REPAIR_POST_PLACE_WINDOW_END = 0.05;
export const REPAIR_POST_DEPLOY_WINDOW_END = 0.15;
export const REPAIR_POST_COOLDOWN_END = 0.4;
