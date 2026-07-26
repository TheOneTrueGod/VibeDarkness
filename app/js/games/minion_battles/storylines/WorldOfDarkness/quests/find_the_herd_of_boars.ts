/**
 * Fixed-slot plumbing fixture for unit tests (not in the post–Core Awakening bank filters).
 * Real content quest: `scavenge_the_plains`.
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
