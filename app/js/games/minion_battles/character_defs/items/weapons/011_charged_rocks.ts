import type { ItemDef } from '../types';

/** Charged Rocks - Rocks soaked in light, thrown with a crackling charge. */
export const chargedRocksItem: ItemDef = {
    id: '011',
    name: 'Charged Rocks',
    description: 'Rocks soaked in light, thrown with a crackling charge.',
    slots: ['weapon'],
    attackRange: 'ranged',
    cardsToAdd: ['throw_charged_rock'],
    /** Item passive: +1 Light Charge at the start of every round. */
    roundStartRecoveryCharges: [{ chargeType: 'lightCharge', amount: 1 }],
    icon: '011_charged_rocks.svg',
    tier: 2,
    upgradesFrom: '001',
    campaignIds: ['world_of_darkness'],
};
