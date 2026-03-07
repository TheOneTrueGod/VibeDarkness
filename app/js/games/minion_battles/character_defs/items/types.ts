/**
 * Item definitions. Equipped items add cards to a unit's deck at battle start.
 * Characters have equipment; story choices can add/swap items (e.g. by slot).
 */

export type EquipmentSlotType = 'hands' | 'core';

export interface ItemCardEntry {
    cardId: string;
    count: number;
}

export interface ItemDef {
    id: string;
    name: string;
    /** Slots this item occupies (e.g. 'hands' — only one item per slot typically). */
    slots: EquipmentSlotType[];
    /** Cards to add to the unit's deck when this item is equipped. */
    cardsToAdd: ItemCardEntry[];
    /** Icon filename under character_defs/items/assets (e.g. '001_rocks.svg'). */
    icon: string;
}
