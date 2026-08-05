/**
 * Whether the local player has no interactive loadout choices on character select.
 * When true, the loadout selector shows its empty state (campfire).
 */
export function playerDoesNotNeedLoadoutSelection(selectionRequired = false): boolean {
    return !selectionRequired;
}
