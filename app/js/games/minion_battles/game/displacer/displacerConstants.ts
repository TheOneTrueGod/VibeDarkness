/**
 * Shared tuning for the Displacer Spirit boss kit (Light Eater, Phantom Decoy, clones).
 * Ability-specific numbers (damage, windups) live next to their abilities; this file holds
 * values shared by abilities, AI trees, and the mission.
 */

export const DISPLACER_SPIRIT_ID = 'displacer_spirit';
export const DISPLACER_CLONE_ID = 'displacer_clone';
/** Ability ids of the spirit's signature moves (as on their cards), for unit-def data such as phase grants. */
export const DISPLACER_LIGHT_EATER_ID = '0018';
export const DISPLACER_PHANTOM_DECOY_ID = '0019';

/** Super bars the boss spawns with (also set via the unit def's `startingResources`). */
export const DISPLACER_STARTING_SUPER_BARS = 2;

// --- Clone mirroring -------------------------------------------------------
/** At most this many clones echo each Displacer Bolt. */
export const CLONE_MIRROR_MAX_CLONES = 3;
/** Seconds after the boss starts its bolt before the first clone follows up. */
export const CLONE_MIRROR_START_DELAY_SEC = 0.2;
/** Seconds between each successive mirrored clone's cast (clone i fires start + i * stagger). */
export const CLONE_MIRROR_STAGGER_SEC = 0.28;

// --- Phantom Decoy placement ----------------------------------------------
/** Clones conjured per Phantom Decoy while calm; the enraged spirit conjures more. */
export const PHANTOM_DECOY_CLONE_COUNT = 6;
export const PHANTOM_DECOY_ENRAGED_CLONE_COUNT = 12;
/** Clones appear within this many px of the targeted player. */
export const PHANTOM_DECOY_SPAWN_RADIUS = 160;
/** Clones keep at least this far from the targeted player so they don't land on top of them. */
export const PHANTOM_DECOY_MIN_DISTANCE_FROM_TARGET = 50;
/** Minimum centre-to-centre spacing between clones (px) so they do not overlap. */
export const PHANTOM_DECOY_MIN_SPACING = 44;

// --- Decoy visuals (display only) -----------------------------------------
/** Wall-time fade-in (ms) of a decoy as it appears, and of the spirit reappearing among a Phantom Decoy batch. */
export const DISPLACER_FADE_IN_MS = 250;
/** Phantom Decoy wind-up: the spirit flickers between two copies drifting this far (px) from its centre. */
export const PHANTOM_DECOY_SPLIT_SEPARATION_PX = 22;
/** Phantom Decoy wind-up flicker rate (frames per second of game time). */
export const PHANTOM_DECOY_SPLIT_FLICKER_FPS = 14;

// --- Phantom Echo (passive: a decoy per projectile fired) ---------------------
/** The spirit only conjures an echo decoy while fewer than this many decoys are alive. */
export const PHANTOM_ECHO_MAX_DECOYS = 4;
/** Echo decoys appear in this ring around the spirit (px). */
export const PHANTOM_ECHO_MIN_DISTANCE = 40;
export const PHANTOM_ECHO_MAX_DISTANCE = 100;
/** Random placement attempts per clone before giving up on it. */
export const PHANTOM_DECOY_PLACEMENT_ATTEMPTS = 30;

// --- Positioning (boss + clones) -----------------------------------------
/** Boss/clones hover at this fraction of the bolt's range from the nearest player. */
export const DISPLACER_KITE_RANGE_FRACTION = 0.7;
/** Distance error (px) beyond which a paused unit resumes moving to restore its spacing. */
export const DISPLACER_KITE_TOLERANCE = 35;
/** Move/pause segment durations (seconds), picked uniformly in [min, max]. */
export const DISPLACER_KITE_MOVE_SEC = { min: 0.7, max: 1.6 } as const;
export const DISPLACER_KITE_PAUSE_SEC = { min: 0.3, max: 0.9 } as const;
/** Max angular drift (radians) of each move segment's destination around the target. */
export const DISPLACER_KITE_ORBIT_RADIANS = 0.9;

// --- Round timing (fractions of ROUND_DURATION) -----------------------------
// Phantom Decoy has no schedule: it follows every Light Eater (`aiSettings.followUp`) and is recovered by
// the spirit's HP phases (`grantAiCasts` on its unit def).
export const LIGHT_EATER_ROUND_WINDOW = { start: 0.25, end: 0.75 } as const; // second or third quarter
/** Light Eater is usable only every other round (rounds 0, 2, 4, ...). */
export const LIGHT_EATER_ROUND_INTERVAL = 2;
export const DISPLACER_BOLT_USES_PER_ROUND = 4;
/** Enraged spirit runs its bolt cast and the clone echoes on this fraction of the normal durations (30% faster). */
export const DISPLACER_BOLT_ENRAGED_TIME_SCALE = 0.7;
/** Enraged bolt capacity per round (calm is DISPLACER_BOLT_USES_PER_ROUND): an extra couple of shots. */
export const DISPLACER_BOLT_ENRAGED_USES_PER_ROUND = 6;
/** Enraged Light Eater looses this many times the usual ring of bolts. */
export const LIGHT_EATER_ENRAGED_RING_MULTIPLIER = 2;
