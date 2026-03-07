import type { ItemDef } from '../types';

/** Smoldering stick (wood) - adds Swing Bat cards. */
export const torchItem: ItemDef = {
    id: '002',
    name: 'Smoldering stick',
    slots: ['hands'],
    cardsToAdd: [{ cardId: '0103', count: 2 }],
    icon: '002_torch.svg',
};
