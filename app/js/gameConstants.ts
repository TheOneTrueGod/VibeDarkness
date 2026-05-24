/**
 * App-wide gameplay / UX toggles (not per-game-module).
 * Import from here for constants shared across the frontend.
 */

/**
 * When true, the battle canvas does not start its render loop until Pixi init and
 * battle asset loading (character SVGs, effect textures, etc.) have finished.
 * When false, rendering starts as soon as the Pixi application is ready; sprites
 * appear once assets finish loading (see GameRenderer unit sprite sync).
 */
export const WAIT_FOR_ALL_ASSETS_TO_LOAD_BEFORE_GAME_START = false;

/**
 * Player units only. When true, a wait order ends as soon as the unit finishes its movement
 * (after the minimum wait duration). When false, the wait always runs for its full duration.
 * AI units always run the full wait duration and never set movementPaused on expiry.
 */
export const PLAYER_WAIT_ENDS_ON_MOVEMENT_COMPLETE = false;
