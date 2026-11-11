/**
 * Readers for scaling research modifiers (`AbilityModifier` in `researchTrees/types.ts`) that abilities and
 * cast behaviours apply to their own numbers. A leaf module (type imports only), so cast behaviours can use
 * it without import cycles.
 */
import type { AbilityModifier } from '../../../researchTrees/types';

/** The caster's research modifier for `abilityId`, if any. */
export function getCasterAbilityModifier(
    caster: { abilityModifiers?: Record<string, AbilityModifier> } | undefined,
    abilityId: string,
): AbilityModifier | undefined {
    return caster?.abilityModifiers?.[abilityId];
}

/** Factor for radii and widths so the area scales by `areaMult` (the square root of it). 1 when unset. */
export function getAreaRadiusScale(modifier: AbilityModifier | undefined): number {
    return Math.sqrt(Math.max(0, modifier?.areaMult ?? 1));
}

/** `base` repeats plus `repeatCountFlat`, never below 1. */
export function getRepeatCount(base: number, modifier: AbilityModifier | undefined): number {
    return Math.max(1, base + (modifier?.repeatCountFlat ?? 0));
}

/** Half-width in tiles of a square tile area (`base` 1 = 3x3) plus `tileAreaRadiusFlat`, never below 0. */
export function getTileAreaHalfWidth(base: number, modifier: AbilityModifier | undefined): number {
    return Math.max(0, base + (modifier?.tileAreaRadiusFlat ?? 0));
}
