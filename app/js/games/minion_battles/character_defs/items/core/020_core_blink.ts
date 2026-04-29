import type { ItemDef } from '../types';

/** The Blink Core: placeholder core for mission 005 reward choices. */
export const coreBlinkItem: ItemDef = {
    id: '020',
    name: 'The Blink Core',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    cardsToAdd: [
        { cardId: '0102', count: 3 }, // Punch
        { cardId: '0101', count: 2 }, // Dodge
    ],
    icon: '020_core_blink.svg',
};
