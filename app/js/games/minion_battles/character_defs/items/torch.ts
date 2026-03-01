import type { ItemDef } from './types';

/** Smoldering stick - adds Bash cards. */
export const torchItem: ItemDef = {
    id: 'torch',
    name: 'Smoldering stick',
    cardsToAdd: [{ cardId: '0102', count: 2 }],
};
