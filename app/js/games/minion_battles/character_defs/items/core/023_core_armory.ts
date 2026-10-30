import type { ItemDef } from '../types';

export const coreArmoryItem: ItemDef = {
    id: '023',
    name: 'Armory Core',
    description: 'Conjure weapons and plant turrets. Unlocks Create Sword and Deploy Turret when researched.',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    cardsToAdd: ['0101', '0120', '0601'],
    resourcesToAdd: ['charge'],
    icon: '023_core_armory.svg',
};
