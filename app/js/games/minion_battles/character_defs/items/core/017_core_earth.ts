import type { ItemDef } from '../types';

/** The Earth Core: placeholder core for mission 005 reward choices. */
export const coreEarthItem: ItemDef = {
    id: '017',
    name: 'The Earth Core',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    cardsToAdd: [
        { cardId: '0102', count: 3 }, // Punch
        { cardId: '0101', count: 2 }, // Dodge
    ],
    icon: '017_core_earth.svg',
};
