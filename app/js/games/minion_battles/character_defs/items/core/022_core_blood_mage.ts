import type { ItemDef } from '../types';

/** The Blood Mage core's Water bar: it sets the max and what a battle starts with. */
export const BLOOD_CORE_WATER_MAX = 10;
export const BLOOD_CORE_WATER_START = 6;

export const coreBloodMageItem: ItemDef = {
    id: '022',
    name: 'Blood Mage Core',
    description: 'Spends your own blood as power. Unlocks Blood Mend and Blood Shard when researched.',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    cardsToAdd: ['0101', '0120', '0601'],
    resourceGrants: [{ resourceId: 'water', max: BLOOD_CORE_WATER_MAX, startingAmount: BLOOD_CORE_WATER_START }],
    icon: '022_core_blood_mage.svg',
};
