import type { ItemDef } from '../types';

export const rocksItem: ItemDef = {
    id: '001',
    name: 'Rocks',
    slots: ['weapon'],
    cardsToAdd: [{ cardId: 'throw_rock', count: 2 }],
    icon: '001_rocks.svg',
};
