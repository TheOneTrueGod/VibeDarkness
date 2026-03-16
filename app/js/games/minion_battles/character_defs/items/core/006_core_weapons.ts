import type { ItemDef } from '../types';

/** WeaponsCore: 3 weapon slots, no utility. Default for Bunker at the End. */
export const coreWeaponsItem: ItemDef = {
    id: '006',
    name: 'WeaponsCore',
    slots: ['core'],
    slotLayout: { weaponSlots: 3, utilitySlots: 0 },
    cardsToAdd: [],
    icon: '006_core_weapons.svg',
};
