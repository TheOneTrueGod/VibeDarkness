/**
 * Pinwheel presets: named arm settings for `CastBehaviours.Pinwheel` (rotating arms that fire projectiles).
 *
 * A preset holds only how the arms turn and fire (arm counts, turn rate, fire interval, projectile speed). The
 * ability supplies the projectile itself (damage, radius, range, type, hit rule); `pinwheelConfig` joins the two.
 */

import type { PinwheelConfig, PinwheelProjectile } from './CastBehaviours/PinwheelBehaviour';

export interface PinwheelPreset {
    /** Arms turning clockwise, evenly spaced. */
    arms: number;
    /** Arms turning anticlockwise, evenly spaced and offset by half the clockwise arm spacing. */
    counterArms: number;
    /** Degrees per second each arm turns. */
    turnDegPerSec: number;
    /** Seconds between shots from each arm. */
    fireIntervalSec: number;
    /** Projectile speed in px/s (the pace is part of how a preset reads, so it travels with it). */
    projectileSpeed: number;
}

export const PINWHEEL_PRESETS = {
    /** One slow arm: one full turn per 5 s window. */
    gentle: { arms: 1, counterArms: 0, turnDegPerSec: 72, fireIntervalSec: 0.2, projectileSpeed: 110 },
    /** Two opposite arms, same turn rate. */
    doubled: { arms: 2, counterArms: 0, turnDegPerSec: 72, fireIntervalSec: 0.25, projectileSpeed: 110 },
    /** One arm, twice as fast, faster thorns. */
    swift: { arms: 1, counterArms: 0, turnDegPerSec: 144, fireIntervalSec: 0.15, projectileSpeed: 140 },
    /** One clockwise and one anticlockwise arm, starting opposite. */
    weave: { arms: 1, counterArms: 1, turnDegPerSec: 72, fireIntervalSec: 0.25, projectileSpeed: 110 },
} as const satisfies Record<string, PinwheelPreset>;

export type PinwheelPresetId = keyof typeof PINWHEEL_PRESETS;

/** Join a preset with the ability's projectile (minus speed, which the preset owns) into a behaviour config. */
export function pinwheelConfig(
    presetId: PinwheelPresetId,
    projectile: Omit<PinwheelProjectile, 'speed'>,
    startAngle: PinwheelConfig['startAngle'] = 'random',
): PinwheelConfig {
    const p: PinwheelPreset = PINWHEEL_PRESETS[presetId];
    return {
        arms: p.arms,
        counterArms: p.counterArms,
        turnDegPerSec: p.turnDegPerSec,
        fireIntervalSec: p.fireIntervalSec,
        startAngle,
        projectile: { ...projectile, speed: p.projectileSpeed },
    };
}
