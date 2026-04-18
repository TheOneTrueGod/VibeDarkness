import type { ItemDef } from '../types';

/** Throwing Knives - research-upgraded rocks with higher direct damage. */
export const throwingKnivesItem: ItemDef = {
    id: '016',
    name: 'Throwing Knives',
    slots: ['weapon'],
    cardsToAdd: [{ cardId: 'throw_knife', count: 2 }],
    icon: '016_throwing_knives.svg',
};
