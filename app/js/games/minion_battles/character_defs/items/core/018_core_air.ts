import type { ItemDef } from '../types';

/** The Air Core: placeholder core for mission 005 reward choices. */
export const coreAirItem: ItemDef = {
    id: '018',
    name: 'The Air Core',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    cardsToAdd: [
        { cardId: '0102', count: 3 }, // Punch
        { cardId: '0101', count: 2 }, // Dodge
    ],
    icon: '018_core_air.svg',
};
