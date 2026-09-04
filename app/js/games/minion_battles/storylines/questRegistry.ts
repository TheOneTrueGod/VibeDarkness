/**
 * Quest definition registry (QUEST_MAP) and lookup helpers.
 */

import type { QuestDef } from './questTypes';
import { FIND_THE_HERD_OF_BOARS } from './WorldOfDarkness/quests/find_the_herd_of_boars';
import { SCAVENGE_THE_PLAINS } from './WorldOfDarkness/quests/scavenge_the_plains';

export const QUEST_MAP: Record<string, QuestDef> = {
    /** Plumbing / fixed-slot fixture; also a dedicated chapter 2 map node. */
    [FIND_THE_HERD_OF_BOARS.id]: FIND_THE_HERD_OF_BOARS,
    [SCAVENGE_THE_PLAINS.id]: SCAVENGE_THE_PLAINS,
};

export function getQuestDef(questDefId: string): QuestDef | undefined {
    return QUEST_MAP[questDefId];
}

/** All registered quests for a campaign / storyline id. */
export function listQuestsForCampaign(campaignId: string): QuestDef[] {
    return Object.values(QUEST_MAP).filter((q) => q.campaignId === campaignId);
}
