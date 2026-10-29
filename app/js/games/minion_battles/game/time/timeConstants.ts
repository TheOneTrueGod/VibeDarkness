/**
 * Time dilation constants. See `./AGENTS.md` for the vocabulary (tick / tick time / world time /
 * local time / tempo / world pace).
 */
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { FIXED_DT } from '../gameConstants';

/** Lowest tempo an actor can have without being frozen. */
export const TEMPO_MIN = 0.01;
/** Highest tempo an actor can have. */
export const TEMPO_MAX = 100;
/** Lowest non-zero world pace a focal request can ask for. */
export const WORLD_PACE_MIN = 0.01;

/** Hard cap (tick-time seconds) on any Time Stop; nothing can freeze the world indefinitely. */
export const MAX_TIME_STOP_TICK_SECONDS = 5;

/** Per-actor per-tick budget of step pieces; leftover local time is carried as `timeDebt`. */
export const MAX_STEP_PIECES_PER_TICK = 64;

/** Max distance (px) an actor may travel in one step piece (about half a tile). */
export const MAX_PIECE_TRAVEL_PX = CELL_SIZE / 2;

/** What a hit on a frozen (tempo 0) actor does. */
export type FrozenHitPolicy = 'immediate' | 'onResume';

/** Engine default for hits on frozen actors; Time Stop defs and per-hit options may override. */
export const DEFAULT_FROZEN_HIT_POLICY: FrozenHitPolicy = 'immediate';

/**
 * Hitstop on the striking body at tempo 1: 2 lockstep ticks. Abilities override with seconds.
 * Scaled by that actor's tempo in `hitPauseTicks`; world pace does not scale it.
 */
export const DEFAULT_HIT_STOP_SECONDS = 2 * FIXED_DT;

/**
 * Hitstun on the unit that was hit, at tempo 1: 4 lockstep ticks (a bit longer than hitstop).
 * Same tempo scale as hitstop. World pace does not scale it.
 */
export const DEFAULT_HIT_STUN_SECONDS = 4 * FIXED_DT;

/**
 * World-time length for the legacy `HitStopBuff` (`HIT_STOP_DURATION_SECONDS` = `ticks * FIXED_DT`)
 * on checkpoints that have no `pauseTicks`. Strike pauses do not read this object.
 *
 * Hitstop is `DEFAULT_HIT_STOP_SECONDS` (`2 * FIXED_DT`) and hitstun is `DEFAULT_HIT_STUN_SECONDS`
 * (`4 * FIXED_DT`), scaled by that actor's tempo in `hitPauseTicks`. World pace does not scale them.
 * Force Push's hitstop is `FORCE_PUSH_HIT_STOP_SECONDS` (`3 * FIXED_DT`).
 */
export const HIT_STOP_DEFAULTS = {
    ticks: 3,
    appliesTo: 'attackerAndVictim',
    mechanism: 'freezeModifier',
} as const;
