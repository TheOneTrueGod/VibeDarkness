import type { ItemDef } from '../types';

export const coreCommandItem: ItemDef = {
    id: '020',
    name: 'Command Core',
    description: 'Binds a companion to your will. Unlocks Loyal Companion when researched.',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    cardsToAdd: ['0101', '0120', '0601'],
    icon: '020_core_command.svg',
};
