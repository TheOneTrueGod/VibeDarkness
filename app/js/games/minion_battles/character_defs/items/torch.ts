import type { ItemDef } from './types';

/** Smoldering stick (wood) - adds Swing Bat cards. */
export const torchItem: ItemDef = {
    id: 'torch',
    name: 'Smoldering stick',
    cardsToAdd: [{ cardId: '0103', count: 2 }],
};
