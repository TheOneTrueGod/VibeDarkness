import type { ItemDef } from '../types';

/** BeastCore: 2 Dodge, 2 Beast Claw, 2 Claw. Reward from mission 004 (Monster). */
export const beastCoreItem: ItemDef = {
    id: '014',
    name: 'BeastCore',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    cardsToAdd: ['0101', '0111'],
    icon: '014_beast_core.svg',
};
