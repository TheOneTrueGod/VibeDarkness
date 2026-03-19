import type { ItemDef } from '../types';

/** Charged Rocks - research-upgraded rocks. */
export const chargedRocksItem: ItemDef = {
    id: '013',
    name: 'Charged Rocks',
    slots: ['weapon'],
    cardsToAdd: [{ cardId: 'throw_charged_rock', count: 2 }],
    icon: '013_charged_rocks.svg',
};

