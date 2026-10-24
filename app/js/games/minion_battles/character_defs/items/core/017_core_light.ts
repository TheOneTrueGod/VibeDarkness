import type { ItemDef } from '../types';

export const coreLightItem: ItemDef = {
    id: '017',
    name: 'Light Core',
    description: 'Channels ambient light into combat energy.',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    // Light Blast (0801) is granted separately by Light Core research; Throw Torch stays.
    cardsToAdd: ['0101', '0120', '0115', '0601'],
    resourcesToAdd: ['light'],
    icon: '017_core_light.svg',
};
