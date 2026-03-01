import type { ItemDef } from './types';

/** Pot lid - adds Dodge cards. */
export const potShieldItem: ItemDef = {
    id: 'pot_shield',
    name: 'Pot lid',
    cardsToAdd: [{ cardId: '0101', count: 2 }],
};
