import type { ItemDef } from '../types';

/** Shooting Shield - replaces Crystal Embedded Shield. */
export const throwingCrystalShieldItem: ItemDef = {
    id: '012',
    name: 'Shooting Shield',
    slots: ['weapon'],
    cardsToAdd: [
        { cardId: '0113', count: 2 },
        { cardId: '0114', count: 2 },
    ],
    icon: '012_throwing_crystal_shield.svg',
};

