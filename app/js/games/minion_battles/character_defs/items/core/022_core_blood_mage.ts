import type { ItemDef } from '../types';

export const coreBloodMageItem: ItemDef = {
    id: '022',
    name: 'Blood Mage Core',
    description: 'Spends your own blood as power. Unlocks Blood Mend when researched.',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    cardsToAdd: ['0101', '0120', '0601'],
    icon: '022_core_blood_mage.svg',
};
