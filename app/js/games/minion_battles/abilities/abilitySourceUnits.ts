/**
 * Resolve which unit(s) an ability originates from (caster vs pet source).
 * Kept separate from petCommands to avoid circular imports with previewHelpers.
 */

import type { Unit } from '../game/units/Unit';
import type { AbilityStatic } from './Ability';
import { getLivingPetsOfUnit } from '../game/units/petHelpers';

/**
 * Resolve the unit(s) an ability originates from based on its `abilitySource` field.
 * If no `abilitySource` is set, returns `[caster]`.
 *
 * Supported selectors:
 *  - `'nearest'` — the single living pet of `caster` closest to `aimPoint`.
 *  - `'all'` — all living pets of `caster`.
 *
 * `aimPoint` is optional; when absent (e.g. for unit-targeted abilities), nearest
 * is determined by distance from the caster.
 */
export function resolveAbilitySourceUnits(
    ability: Pick<AbilityStatic, 'abilitySource'> & { abilitySource?: { type: 'pet'; selector: 'nearest' | 'all' } },
    caster: Unit,
    units: readonly Unit[],
    aimPoint?: { x: number; y: number },
): Unit[] {
    const src = ability.abilitySource;
    if (!src || src.type !== 'pet') return [caster];

    const pets = getLivingPetsOfUnit(caster, units);
    if (pets.length === 0) return [];

    if (src.selector === 'all') return pets;

    // selector === 'nearest'
    const pivot = aimPoint ?? caster;
    let nearest: Unit = pets[0]!;
    let nearestDist = Math.hypot(nearest.x - pivot.x, nearest.y - pivot.y);
    for (let i = 1; i < pets.length; i++) {
        const p = pets[i]!;
        const d = Math.hypot(p.x - pivot.x, p.y - pivot.y);
        if (d < nearestDist) {
            nearestDist = d;
            nearest = p;
        }
    }
    return [nearest];
}
