/**
 * Quest definition registry (QUEST_MAP) and lookup helpers.
 */

import type { QuestDef } from './questTypes';
import { SWARMLING_SOURCE } from './WorldOfDarkness/quests/swarmling_source';
import { SCAVENGE_THE_PLAINS } from './WorldOfDarkness/quests/scavenge_the_plains';

export const QUEST_MAP: Record<string, QuestDef> = {
    /** Plumbing / fixed-slot fixture; also a dedicated chapter 2 map node. */
    [SWARMLING_SOURCE.id]: SWARMLING_SOURCE,
    [SCAVENGE_THE_PLAINS.id]: SCAVENGE_THE_PLAINS,
};

export function getQuestDef(questDefId: string): QuestDef | undefined {
    return QUEST_MAP[questDefId];
}

/** All registered quests for a campaign / storyline id. */
export function listQuestsForCampaign(campaignId: string): QuestDef[] {
    return Object.values(QUEST_MAP).filter((q) => q.campaignId === campaignId);
}
