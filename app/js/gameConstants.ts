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
