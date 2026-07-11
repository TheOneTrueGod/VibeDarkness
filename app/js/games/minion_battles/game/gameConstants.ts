/** Seconds of game time per round. */
export const ROUND_DURATION = 10;

/** Extra gap (px) between two units when a player pursues a unit target before stopping. */
export const MIN_FOLLOW_RADIUS = 5;

/** When true, ability orders immediately end the turn (legacy behaviour). When false, the player must explicitly confirm with End Turn. */
export const AUTO_END_TURN = false;

/**
 * When true, the ITS "Undo" control only works before any target has been selected for the
 * ability preview. Once the first target is collected, Undo is disabled for the rest of that
 * preview (movement re-input alone does not count as a target).
 */
export const ONLY_UNDO_AT_START = false;

/**
 * When true, units stuck in walls bounce tile-by-tile in a cardinal direction instead of
 * being ejected in one shot. Each bounce: 5 damage, 0.2 s arc, same direction persists
 * through walls, reverses at map edges. Direction can be preset by abilities via
 * `unit.controlledSlingshotDir`.
 */
export const CONTROLLED_SLINGSHOT = true;
