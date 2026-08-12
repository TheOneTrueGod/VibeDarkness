import type { Unit } from '../game/units/Unit';

export interface FilterCombatHitTargetsOpts {
    /**
     * When true (default), units with active iFrames are excluded from combat hits.
     * Set to false for rare true-strike hits that ignore invincibility frames
     * (not used by any live cards yet).
     */
    respectIFrames?: boolean;
}

/**
 * Post-geometry filter for combat hit lists.
 *
 * Drops inactive, dead, and spawning units. By default also drops units with
 * active iFrames (`respectIFrames: true`). Pass `respectIFrames: false` for
 * true-strike opt-out (future content only — do not wire from live cards yet).
 *
 * Environment damage (thorns, DoT, day-light, etc.) must not use this filter.
 */
export function filterCombatHitTargets(
    units: Unit[],
    gameTime: number,
    opts?: FilterCombatHitTargetsOpts,
): Unit[] {
    const respectIFrames = opts?.respectIFrames ?? true;
    return units.filter((unit) => {
        if (!unit.active || !unit.isAlive() || unit.isSpawning()) return false;
        if (respectIFrames && unit.hasIFrames(gameTime)) return false;
        return true;
    });
}
