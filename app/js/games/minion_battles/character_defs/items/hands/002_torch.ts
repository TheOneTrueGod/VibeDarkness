import type { ItemDef } from '../types';

/** Stick (Big) - adds Swing Bat cards. */
export const torchItem: ItemDef = {
    id: '002',
    name: 'Stick (Big)',
    slots: ['hands'],
    cardsToAdd: [{ cardId: '0103', count: 2 }],
    icon: '002_torch.svg',
};
