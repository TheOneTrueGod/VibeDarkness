import { needsMissionAbilitySelection } from '../../../storylines/questPrepLoadout';

/**
 * Whether the prep deck selector (Quest Prep and Prepare Carefully) is relevant: only once the
 * character has more selectable abilities than prep slots. Below that every ability is brought
 * and the selector shows "Not unlocked yet". Shared so both prep flows use one rule.
 */
export function isPrepDeckSelectorUnlocked(selectableCount: number): boolean {
    return needsMissionAbilitySelection(selectableCount);
}

/**
 * Whether the local player has no interactive loadout choices on character select.
 * When true, the loadout selector shows its empty state (campfire).
 */
export function playerDoesNotNeedLoadoutSelection(selectionRequired = false): boolean {
    return !selectionRequired;
}
