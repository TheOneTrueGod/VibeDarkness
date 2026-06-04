import type { ItemDef } from '../types';

/** The Air Core: placeholder core for mission 005 reward choices. */
export const coreAirItem: ItemDef = {
    id: '018',
    name: 'The Air Core',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    cardsToAdd: ['0120', '0101'],
    icon: '018_core_air.svg',
};
