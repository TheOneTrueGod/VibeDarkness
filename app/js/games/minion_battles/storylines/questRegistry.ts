/**
 * Quest definition registry (QUEST_MAP) and lookup helpers.
 */

import type { QuestDef } from './questTypes';
import { FIND_THE_HERD_OF_BOARS } from './WorldOfDarkness/quests/find_the_herd_of_boars';

export const QUEST_MAP: Record<string, QuestDef> = {
    [FIND_THE_HERD_OF_BOARS.id]: FIND_THE_HERD_OF_BOARS,
};

export function getQuestDef(questDefId: string): QuestDef | undefined {
    return QUEST_MAP[questDefId];
}

/** All registered quests for a campaign / storyline id. */
export function listQuestsForCampaign(campaignId: string): QuestDef[] {
    return Object.values(QUEST_MAP).filter((q) => q.campaignId === campaignId);
}
