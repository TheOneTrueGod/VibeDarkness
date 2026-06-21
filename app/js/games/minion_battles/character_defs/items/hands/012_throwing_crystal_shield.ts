import type { ItemDef } from '../types';

/** Charged Shield - replaces Crystal Embedded Shield. */
export const throwingCrystalShieldItem: ItemDef = {
    id: '012',
    name: 'Charged Shield',
    description: 'Learn how to store the energy from incoming blows... and redirect it.',
    slots: ['weapon'],
    cardsToAdd: ['0113', '0121'],
    icon: '012_throwing_crystal_shield.svg',
};

