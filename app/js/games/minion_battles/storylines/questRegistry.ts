/**
 * Quest definition registry (QUEST_MAP) and lookup helpers.
 */

import type { QuestDef } from './questTypes';
import { SWARMLING_SOURCE } from './WorldOfDarkness/quests/swarmling_source';
import { SCAVENGE_THE_PLAINS } from './WorldOfDarkness/quests/scavenge_the_plains';
import { INVESTIGATE_THE_WILDLIFE } from './WorldOfDarkness/quests/investigate_the_wildlife';
import { SOUTH_GATE_SWARM_QUEST } from './WorldOfDarkness/quests/south_gate_swarm';
import { CRYSTAL_CORRUPTION_QUEST } from './WorldOfDarkness/quests/crystal_corruption';

export const QUEST_MAP: Record<string, QuestDef> = {
    /** Plumbing / fixed-slot fixture; also a dedicated chapter 2 map node. */
    [SWARMLING_SOURCE.id]: SWARMLING_SOURCE,
    [SCAVENGE_THE_PLAINS.id]: SCAVENGE_THE_PLAINS,
    [INVESTIGATE_THE_WILDLIFE.id]: INVESTIGATE_THE_WILDLIFE,
    [SOUTH_GATE_SWARM_QUEST.id]: SOUTH_GATE_SWARM_QUEST,
    [CRYSTAL_CORRUPTION_QUEST.id]: CRYSTAL_CORRUPTION_QUEST,
};

export function getQuestDef(questDefId: string): QuestDef | undefined {
    return QUEST_MAP[questDefId];
}

/** All registered quests for a campaign / storyline id. */
export function listQuestsForCampaign(campaignId: string): QuestDef[] {
    return Object.values(QUEST_MAP).filter((q) => q.campaignId === campaignId);
}
