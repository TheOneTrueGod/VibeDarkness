import type { ItemDef } from '../types';

/** Pot lid - adds two Raise Shield cards. */
export const potShieldItem: ItemDef = {
    id: '003',
    name: 'Pot lid',
    slots: ['weapon'],
    cardsToAdd: [{ cardId: '0104', count: 2 }],
    icon: '003_pot_shield.svg',
};
