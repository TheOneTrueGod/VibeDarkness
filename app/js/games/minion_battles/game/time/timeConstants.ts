/**
 * Time dilation constants. See `./AGENTS.md` for the vocabulary (tick / tick time / world time /
 * local time / tempo / world pace).
 */
import { CELL_SIZE } from '../../terrain/TerrainGrid';

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
 * Hit-stop defaults (PLACEHOLDER; `GameEngine.requestHitPause` is still a no-op).
 *
 * A future implementation applies a short tick-time `freeze` `TimeModifier` to the attacker and
 * victim (not world pace), so the rest of the world keeps moving and stored momentum resumes
 * afterwards.
 */
export const HIT_STOP_DEFAULTS = {
    ticks: 3,
    appliesTo: 'attackerAndVictim',
    mechanism: 'freezeModifier',
} as const;
