import type { ItemDef } from '../types';

/** Pipe Bat — from Pipe Bat research; adds Swing Bat cards. */
export const pipeBatItem: ItemDef = {
    id: '021',
    name: 'Pipe Bat',
    slots: ['weapon'],
    cardsToAdd: [{ cardId: '0115', count: 2 }],
    icon: '002_torch.svg',
};
