import type { ItemDef } from '../types';
import { ResourceId } from '../../../resources/resourceIds';
import { KINSHIP_MAX, KINSHIP_STARTING_AMOUNT } from '../../../resources/Kinship';

export const coreCommandItem: ItemDef = {
    id: '020',
    name: 'Command Core',
    description: 'Binds a companion to your will. Unlocks Loyal Companion when researched.',
    slots: ['core'],
    slotLayout: { weaponSlots: 1, utilitySlots: 1 },
    cardsToAdd: ['0101', '0120', '0601'],
    resourceGrants: [{ resourceId: ResourceId.Kinship, max: KINSHIP_MAX, startingAmount: KINSHIP_STARTING_AMOUNT }],
    icon: '020_core_command.svg',
};
