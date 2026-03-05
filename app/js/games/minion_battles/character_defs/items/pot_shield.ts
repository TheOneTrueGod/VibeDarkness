import type { ItemDef } from './types';

/** Pot lid - adds two Raise Shield cards. */
export const potShieldItem: ItemDef = {
    id: 'pot_shield',
    name: 'Pot lid',
    cardsToAdd: [{ cardId: '0104', count: 2 }],
};
