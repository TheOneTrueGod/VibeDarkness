import type { ItemDef } from '../types';

/** BasicCore: 3 Bash, 2 Dodge. One weapon slot, one utility slot. Default for World of Darkness. */
export const coreBasicItem: ItemDef = {
    id: '004',
    name: 'BasicCore',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    cardsToAdd: [
        { cardId: '0102', count: 3 },
        { cardId: '0101', count: 2 },
    ],
    icon: '004_core_basic.svg',
};
