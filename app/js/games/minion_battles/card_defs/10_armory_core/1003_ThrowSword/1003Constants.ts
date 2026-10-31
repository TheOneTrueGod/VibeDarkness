/** Throw Sword tuning. Throw Shield reuses the timings and the thrown-weapon flight. */
import { THROW_PROJECTILE_SPEED } from '../../throwNumbers';

export const THROW_SWORD_DAMAGE = 12;

/** Throw Sword cast: a short windup, then the blade leaves. */
export const THROW_SWORD_WINDUP_END = 0.15;
export const THROW_SWORD_ACTIVE_END = 0.35;
export const THROW_SWORD_COOLDOWN_END = 0.55;
/** Degrees per second a thrown conjured weapon spins. */
export const THROWN_WEAPON_SPIN_DEGREES_PER_SECOND = 720;
/** Flight speed of a thrown sword or shield: half the shared throw speed, so the spin reads. */
export const THROWN_WEAPON_SPEED = THROW_PROJECTILE_SPEED / 2;

export const THROW_SWORD_AIM_LABEL = 'Direction';
