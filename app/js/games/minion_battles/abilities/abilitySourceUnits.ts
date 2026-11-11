/**
 * Resolve which unit(s) an ability originates from (caster vs pet source).
 * Kept separate from petCommands to avoid circular imports with previewHelpers.
 */

import type { Unit } from '../game/units/Unit';
import type { PetAbilitySource } from './Ability';
import { getLivingPetsOfUnit } from '../game/units/petHelpers';
import { isUnitBusy, type CastPriorityEngine } from '../game/units/castPriority';

/**
 * The engine as a cast-priority context, when it is one (it has `gameTime`). Preview callbacks get the
 * engine as `gameState?: unknown`; this narrows it for `resolveAbilitySourceUnits` / `isUnitBusy`.
 */
export function asCastPriorityEngine(engine: unknown): CastPriorityEngine | undefined {
    const gameTime = (engine as { gameTime?: unknown } | null | undefined)?.gameTime;
    return typeof gameTime === 'number' ? (engine as CastPriorityEngine) : undefined;
}

/**
 * Resolve the unit(s) an ability originates from based on its `abilitySource` field.
 * If no `abilitySource` is set, returns `[caster]`.
 *
 * Supported selectors:
 *  - `'nearest'` — the single living pet of `caster` closest to `aimPoint`.
 *  - `'all'` — all living pets of `caster`.
 *
 * With `requireFree`, busy pets (`isUnitBusy`, see `game/units/castPriority.ts`) are left out first, so
 * `'nearest'` is the nearest **free** pet, however far. That needs `engine` (anything with `gameTime`);
 * without it the busy check cannot run and every living pet counts.
 *
 * `aimPoint` is optional; when absent (e.g. for unit-targeted abilities), nearest
 * is determined by distance from the caster.
 */
export function resolveAbilitySourceUnits(
    ability: { abilitySource?: PetAbilitySource },
    caster: Unit,
    units: readonly Unit[],
    aimPoint?: { x: number; y: number },
    engine?: CastPriorityEngine,
): Unit[] {
    const src = ability.abilitySource;
    if (!src || src.type !== 'pet') return [caster];

    let pets = getLivingPetsOfUnit(caster, units);
    if (src.requireFree && engine) pets = pets.filter((p) => !isUnitBusy(p, units, engine));
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

/**
 * The unit a running cast's later step (e.g. a `confirmRadius` preview) originates from: the source as
 * `resolveAbilitySourceUnits` picks it, **without** the `requireFree` busy filter (the cast checked that at
 * its start, and the pet it committed is now busy with that very order), falling back to the caster.
 */
export function resolveMidCastSourceUnit(
    ability: { abilitySource?: PetAbilitySource },
    caster: Unit,
    units: readonly Unit[],
    aimPoint?: { x: number; y: number },
): Unit {
    return resolveAbilitySourceUnits(ability, caster, units, aimPoint)[0] ?? caster;
}
