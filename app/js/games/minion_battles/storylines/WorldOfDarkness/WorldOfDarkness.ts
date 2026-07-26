import type { StorylineDef } from '../types';
import type { QuestSlotBank } from '../questTypes';

/** Dev/example bank id — unlocks after light_empowered; not wired to main path edges yet. */
export const WOD_EXAMPLE_QUEST_BANK_ID = 'wod_example_quest_bank';

/** Example required clears for the World of Darkness quest bank (content-defined). */
export const WOD_EXAMPLE_QUEST_BANK_REQUIRED_CLEARS = 2;

/**
 * DEV/EXAMPLE quest slot bank after `light_empowered`.
 * Filters match placeholder quest defs (e.g. find_the_herd_of_boars). Main campaign edges are
 * unchanged until real content is ready — bank gate helpers are covered in unlock.questBanks tests.
 */
export const WOD_EXAMPLE_QUEST_BANK: QuestSlotBank = {
    id: WOD_EXAMPLE_QUEST_BANK_ID,
    unlockAfterMissionId: 'light_empowered',
    requiredClears: WOD_EXAMPLE_QUEST_BANK_REQUIRED_CLEARS,
    filters: { tags: ['placeholder'] },
    displaySlotCount: WOD_EXAMPLE_QUEST_BANK_REQUIRED_CLEARS,
};

export const WorldOfDarknessStoryline: StorylineDef = {
    id: 'world_of_darkness',
    title: 'A World of Darkness',
    startMissionId: 'dark_awakening',
    edges: [
        { fromMissionId: 'dark_awakening', result: 'victory', toMissionId: 'towards_the_light' },
        { fromMissionId: 'towards_the_light', result: 'victory', toMissionId: 'light_empowered' },
        { fromMissionId: 'light_empowered', result: 'victory', toMissionId: 'cave_respite' },
        { fromMissionId: 'cave_respite', result: 'victory', toMissionId: 'monster' },
        { fromMissionId: 'cave_respite', result: 'victory', toMissionId: 'crystal_corruption', isSideMission: true },
        { fromMissionId: 'crystal_corruption', result: 'victory', toMissionId: 'monster' },
        { fromMissionId: 'monster', result: 'victory', toMissionId: 'core_awakening' },
        // Placeholder slot: a mission between core_awakening and south_gate_swarm will be inserted later.
        { fromMissionId: 'core_awakening', result: 'victory', toMissionId: 'south_gate_swarm' },
        { fromMissionId: 'south_gate_swarm', result: 'victory', toMissionId: 'ember_threshold' },
        { fromMissionId: 'ember_threshold', result: 'victory', toMissionId: 'thorn_march' },
        { fromMissionId: 'thorn_march', result: 'victory', toMissionId: 'thornling_rise' },
    ],
    // DEV/EXAMPLE — do not treat as final campaign pacing.
    questSlotBanks: [WOD_EXAMPLE_QUEST_BANK],
};
