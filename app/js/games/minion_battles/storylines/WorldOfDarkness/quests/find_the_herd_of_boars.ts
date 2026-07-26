/**
 * Placeholder World of Darkness quest — fixed slots only for plumbing tests.
 * Title/content are temporary stand-ins until real boar-herd missions exist.
 */

import type { QuestDef } from '../../questTypes';

export const FIND_THE_HERD_OF_BOARS: QuestDef = {
    id: 'find_the_herd_of_boars',
    title: 'Find the herd of boars',
    campaignId: 'world_of_darkness',
    tags: ['placeholder', 'fixed_slots'],
    slots: [
        { kind: 'fixed', missionId: 'dark_awakening' },
        { kind: 'fixed', missionId: 'towards_the_light' },
        { kind: 'fixed', missionId: 'light_empowered' },
    ],
};
