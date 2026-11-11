/**
 * The shared tooltip line builder: an ability's own `getTooltipText` lines plus lines derived from its
 * def fields, so a rule set on the def shows up on every card that uses it with no card text edits.
 * UI that renders an ability tooltip calls `getAbilityTooltipLines`, not `getTooltipText` directly.
 */

import type { AbilityStatic } from './Ability';

/** Derived from `abilitySource.requireFree` (see `PetAbilitySource`). */
export const REQUIRES_FREE_SPIRIT_TOOLTIP_LINE = 'Requires an unoccupied spirit animal.';

/** Tooltip lines that come from def fields rather than card text. */
export function getDerivedAbilityTooltipLines(ability: Pick<AbilityStatic, 'abilitySource'>): string[] {
    const lines: string[] = [];
    if (ability.abilitySource?.requireFree) lines.push(REQUIRES_FREE_SPIRIT_TOOLTIP_LINE);
    return lines;
}

/** The card's own tooltip lines followed by its derived lines. */
export function getAbilityTooltipLines(ability: AbilityStatic, gameState?: unknown): string[] {
    return [...ability.getTooltipText(gameState), ...getDerivedAbilityTooltipLines(ability)];
}
