/**
 * Resolve which unit(s) an ability originates from (caster vs pet source).
 * Kept separate from petCommands to avoid circular imports with previewHelpers.
 */

import type { Unit } from '../game/units/Unit';
import type { PetAbilitySource } from './Ability';
import { getCommandablePetsOfUnit } from '../game/units/petHelpers';
import { isUnitBusy, type CastPriorityEngine } from '../game/units/castPriority';
import { getCasterAbilityModifier, getPackCount } from './abilityModifierScales';

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
 * With `requiresAbilityId`, only pets that own that ability count (checked before `requireFree`).
 *
 * Lingering pets (past their ephemeral time, finishing a cast; `game/units/ephemeralExpiry.ts`) are never
 * picked when `engine` is given.
 *
 * With `pack` (`'nearest'` only), the picked pet comes first, followed by up to `pack.count` (plus the
 * caster's `packCountFlat` for `ability.id`) other candidate pets within `pack.radiusPx` of it, nearest
 * first. Extras pass every filter above. Commands anchored through `resolveCasterPetAnchor` (Spirit Storm)
 * do not read `pack` yet.
 *
 * `aimPoint` is optional; when absent (e.g. for unit-targeted abilities), nearest
 * is determined by distance from the caster.
 */
export function resolveAbilitySourceUnits(
    ability: { id?: string; abilitySource?: PetAbilitySource },
    caster: Unit,
    units: readonly Unit[],
    aimPoint?: { x: number; y: number },
    engine?: CastPriorityEngine,
): Unit[] {
    const src = ability.abilitySource;
    if (!src || src.type !== 'pet') return [caster];

    let pets = getCommandablePetsOfUnit(caster, units, engine?.gameTime);
    if (src.requiresAbilityId) {
        const required = src.requiresAbilityId;
        pets = pets.filter((p) => p.abilities.includes(required));
    }
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
    return [nearest, ...resolvePackExtras(ability, caster, nearest, pets)];
}

/** The other candidate pets a `pack` command also goes to, nearest to `picked` first. */
function resolvePackExtras(
    ability: { id?: string; abilitySource?: PetAbilitySource },
    caster: Unit,
    picked: Unit,
    candidates: readonly Unit[],
): Unit[] {
    const pack = ability.abilitySource?.pack;
    if (!pack) return [];
    const modifier = ability.id ? getCasterAbilityModifier(caster, ability.id) : undefined;
    const count = getPackCount(pack.count, modifier);
    if (count <= 0) return [];
    return candidates
        .filter((p) => p !== picked)
        .map((p) => ({ p, d: Math.hypot(p.x - picked.x, p.y - picked.y) }))
        .filter(({ d }) => d <= pack.radiusPx)
        .sort((a, b) => a.d - b.d)
        .slice(0, count)
        .map(({ p }) => p);
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
