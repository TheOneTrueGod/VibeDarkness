import type { ItemDef } from '../types';

/** BeastCore: 2 Dodge, 2 Beast Claw. Reward from mission 004 (Monster). */
export const beastCoreItem: ItemDef = {
    id: '014',
    name: 'BeastCore',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    cardsToAdd: [
        { cardId: '0101', count: 2 }, // Dodge
        { cardId: '0511', count: 2 }, // Beast Claw
    ],
    icon: '014_beast_core.svg',
};
