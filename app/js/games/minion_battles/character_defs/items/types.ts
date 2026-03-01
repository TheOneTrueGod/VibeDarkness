/**
 * Item definitions. Equipped items (e.g. from story choices) add cards to a unit's deck at battle start.
 */

export interface ItemCardEntry {
    cardId: string;
    count: number;
}

export interface ItemDef {
    id: string;
    name: string;
    /** Cards to add to the unit's deck when this item is equipped. */
    cardsToAdd: ItemCardEntry[];
}
