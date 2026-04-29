import type { ItemDef } from '../types';

/** The Charged Core: placeholder core for mission 005 reward choices. */
export const coreChargedItem: ItemDef = {
    id: '019',
    name: 'The Charged Core',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    cardsToAdd: [
        { cardId: '0102', count: 3 }, // Punch
        { cardId: '0101', count: 2 }, // Dodge
    ],
    icon: '019_core_charged.svg',
};
