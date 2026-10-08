/**
 * Pure helpers for the Empowered Spirits darkness upgrade: extra SlimeShot projectiles fired in a
 * wedge around the aim direction, plus the length of their (short, pale) targeting preview lines.
 */

import { applyPassiveBonusToBase } from '../../../../researchTrees/passiveBonuses';
import { PassiveStatKey, type PassiveBonuses } from '../../../../researchTrees/types';

/** Angular gap (degrees) between neighbouring wedge projectiles. */
export const SLIME_WEDGE_STEP_DEG = 15;
/** Wedge preview lines are always shorter than this many px (plus the slime radius). */
export const SLIME_WEDGE_PREVIEW_MAX_LENGTH = 40;

/**
 * Angles (radians, ascending) of the extra wedge projectiles, symmetric around `aimAngle`:
 * pairs at +/- 1, 2, ... steps; an odd leftover goes to the left side.
 */
export function computeSlimeWedgeDirections(aimAngle: number, extraCount: number): number[] {
    const stepRad = (SLIME_WEDGE_STEP_DEG * Math.PI) / 180;
    const count = Math.max(0, Math.floor(extraCount));
    const angles: number[] = [];
    for (let i = 0; i < count; i++) {
        const ring = Math.floor(i / 2) + 1;
        const sign = i % 2 === 0 ? -1 : 1;
        angles.push(aimAngle + sign * ring * stepRad);
    }
    return angles.sort((a, b) => a - b);
}

/** Length of one wedge preview line from the slime's centre: strictly < 40 px + slime radius. */
export function getSlimeWedgePreviewLength(slimeRadius: number): number {
    return SLIME_WEDGE_PREVIEW_MAX_LENGTH * 0.75 + slimeRadius;
}

/** Extra wedge projectiles granted by the active darkness-upgrade bag (0 when absent). */
export function getSlimeExtraProjectileCount(bonuses: PassiveBonuses | undefined): number {
    const entry = bonuses?.[PassiveStatKey.EnemyUnitSlimeExtraProjectiles];
    if (!entry) return 0;
    return Math.max(0, applyPassiveBonusToBase(0, entry));
}
