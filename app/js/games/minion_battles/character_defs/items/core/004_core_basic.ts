import type { ItemDef } from '../types';

/** BasicCore: 3 Punch, 2 Dodge, Throw Torch. One weapon slot, one utility slot. Default for World of Darkness. */
export const coreBasicItem: ItemDef = {
    id: '004',
    name: 'BasicCore',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    cardsToAdd: ['0120', '0101', '0601'],
    icon: '004_core_basic.svg',
};
