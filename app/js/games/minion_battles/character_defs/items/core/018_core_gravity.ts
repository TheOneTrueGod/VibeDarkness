import type { ItemDef } from '../types';

export const coreGravityItem: ItemDef = {
    id: '018',
    name: 'Gravity Core',
    description: 'Channels proximity to danger into gravitational force. Unlocks Force Push when researched.',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    // Force Push (0902) is granted via Gravity Core research `addCard`.
    cardsToAdd: ['0101', '0120', '0115'],
    resourcesToAdd: ['gravity'],
    icon: '018_core_gravity.svg',
};
