/**
 * Global CC tuning. In-battle payloads may change freely (see project skills).
 */

/** Hard CC attempts at or below this resolved duration do not apply CC or consume threshold armour. */
export const CC_MIN_POTENCY_SEC = 0.25;

/**
 * When true, CC absorbed by an already-Exposed boss extends the Exposed window (up to the
 * resistance cap). When false the absorption is purely defensive — the timer is frozen and
 * the only visible feedback is the "Resilient" HUD text effect.
 *
 * Set false while tuning the boss fight so players can't accidentally stack exposure time.
 */
export const EXPOSED_DURATION_INCREASES_FROM_CC = false;
