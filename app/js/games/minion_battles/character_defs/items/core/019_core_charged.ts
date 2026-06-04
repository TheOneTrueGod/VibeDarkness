import type { ItemDef } from '../types';

/** The Charged Core: placeholder core for mission 005 reward choices. */
export const coreChargedItem: ItemDef = {
    id: '019',
    name: 'The Charged Core',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    cardsToAdd: ['0120', '0101'],
    icon: '019_core_charged.svg',
};
