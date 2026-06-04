import type { ItemDef } from '../types';

/** The Earth Core: placeholder core for mission 005 reward choices. */
export const coreEarthItem: ItemDef = {
    id: '017',
    name: 'The Earth Core',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    cardsToAdd: ['0120', '0111'],
    icon: '017_core_earth.svg',
};
