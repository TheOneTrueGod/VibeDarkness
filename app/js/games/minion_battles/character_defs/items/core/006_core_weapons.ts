import type { ItemDef } from '../types';

/** WeaponsCore: 3 weapon slots, no utility. Default for Bunker at the End. */
export const coreWeaponsItem: ItemDef = {
    id: '006',
    name: 'WeaponsCore',
    slots: ['core'],
    slotLayout: { weaponSlots: 3, utilitySlots: 0 },
    cardsToAdd: [
        { cardId: '0105', count: 2 }, // Laser Sword
        { cardId: '0101', count: 2 }, // Dodge
    ],
    icon: '006_core_weapons.svg',
};
