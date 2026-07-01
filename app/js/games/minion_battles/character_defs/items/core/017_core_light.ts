import type { ItemDef } from '../types';

export const coreLightItem: ItemDef = {
    id: '017',
    name: 'Light Core',
    description: 'Channels ambient light into combat energy.',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    cardsToAdd: ['0101', '0120', '0115', '0801'],
    resourcesToAdd: ['light'],
    icon: '017_core_light.svg',
};
