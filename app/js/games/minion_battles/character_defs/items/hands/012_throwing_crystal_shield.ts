import type { ItemDef } from '../types';

/** Throwing Crystal Shield - replaces Crystal Embedded Shield. */
export const throwingCrystalShieldItem: ItemDef = {
    id: '012',
    name: 'Throwing Crystal Shield',
    slots: ['weapon'],
    cardsToAdd: [{ cardId: '0104', count: 2 }],
    icon: '012_throwing_crystal_shield.svg',
};

