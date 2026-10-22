/** Fixed time step (seconds): 60 ticks/second. Re-exported from GameEngine for existing imports. */
export const FIXED_DT = 1 / 60;

/**
 * Orphan safeguard for held projectiles (see `Projectile` held state), not a gameplay timer.
 * A projectile held longer than this is deleted with a warning. Cast cleanup should release or
 * cancel held projectiles first, so reaching this limit means a holder was lost somewhere.
 */
export const MAX_HELD_PROJECTILE_SECONDS = 5;

/** Seconds of game time per round. */
export const ROUND_DURATION = 10;

/** Extra gap (px) between two units when a player pursues a unit target before stopping. */
export const MIN_FOLLOW_RADIUS = 5;

/** When true, ability orders immediately end the turn. When false, the player must explicitly confirm with End Turn. Always on in the live game (no UI toggle). */
export const AUTO_END_TURN = true;

/**
 * When true, the ITS "Undo" control only works before any target has been selected for the
 * ability preview. Once the first target is collected, Undo is disabled for the rest of that
 * preview (movement re-input alone does not count as a target).
 */
export const ONLY_UNDO_AT_START = false;

/**
 * Frames (ticks) of interactive targeting preview that keep playing after the preview cast ended
 * early (interrupt / fizzle) before ITS stops for Done. Caps the playahead when the caster is hit by
 * several stuns in a row.
 */
export const ITS_ENDED_EARLY_PLAYAHEAD_MAX_TICKS = 100;

/**
 * When true, units stuck in walls bounce tile-by-tile in a cardinal direction instead of
 * being ejected in one shot. Each bounce: 5 damage, 0.2 s arc, same direction persists
 * through walls, reverses at map edges. Direction can be preset by abilities via
 * `unit.controlledSlingshotDir`.
 */
export const CONTROLLED_SLINGSHOT = true;
