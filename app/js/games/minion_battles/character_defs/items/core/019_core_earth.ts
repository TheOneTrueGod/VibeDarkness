import type { ItemDef } from '../types';

export const coreEarthItem: ItemDef = {
    id: '019',
    name: 'Earth Core',
    description: 'Channels the strength of stone into a stockpile of throwable rock.',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    cardsToAdd: ['0101', '0120', '0115', '0601'],
    resourcesToAdd: ['rock'],
    icon: '019_core_earth.svg',
};
