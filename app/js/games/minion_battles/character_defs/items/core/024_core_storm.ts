import type { ItemDef } from '../types';

export const coreStormItem: ItemDef = {
    id: '024',
    name: 'Storm Core',
    description: 'Builds Static as you move and spends it as lightning. Unlocks Arc Bolt and Static Step when researched.',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    // Arc Bolt (1301) and Static Step (1302) are granted via Storm Core research `addCard`.
    cardsToAdd: ['0101', '0120', '0601'],
    resourcesToAdd: ['static'],
    icon: '024_core_storm.svg',
};
