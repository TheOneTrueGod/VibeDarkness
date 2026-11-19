/**
 * The shared tooltip line builder: an ability's own `getTooltipText` lines plus lines derived from its
 * def fields, so a rule set on the def shows up on every card that uses it with no card text edits.
 * UI that renders an ability tooltip calls `getAbilityTooltipLines`, not `getTooltipText` directly.
 */

import type { AbilityStatic } from './Ability';
import { getAbilityModifier } from './abilityModifierHelpers';
import { buildTagDescriptionLines } from './abilityTagCatalog';
import { getComboGrant } from './comboCancel/comboGrant';

/** Derived from `abilitySource.requireFree` (see `PetAbilitySource`). */
export const REQUIRES_FREE_SPIRIT_TOOLTIP_LINE = 'Requires an unoccupied spirit animal.';

/** Tooltip lines that come from def fields rather than card text. */
export function getDerivedAbilityTooltipLines(
    ability: Pick<AbilityStatic, 'abilitySource' | 'id'>,
    gameState?: unknown,
): string[] {
    const lines: string[] = [];
    if (ability.abilitySource?.requireFree) lines.push(REQUIRES_FREE_SPIRIT_TOOLTIP_LINE);
    if (ability.id) {
        const grant = getComboGrant(getAbilityModifier(gameState, undefined, ability.id));
        if (grant) {
            // Bounded Combo shows its magnitude (chained casts after the first); unlimited is bare.
            lines.push(...buildTagDescriptionLines(
                ['Combo'],
                grant.max === null ? undefined : { Combo: grant.max - 1 },
            ));
        }
    }
    return lines;
}

/** The card's own tooltip lines followed by its derived lines. */
export function getAbilityTooltipLines(ability: AbilityStatic, gameState?: unknown): string[] {
    return [...ability.getTooltipText(gameState), ...getDerivedAbilityTooltipLines(ability, gameState)];
}
