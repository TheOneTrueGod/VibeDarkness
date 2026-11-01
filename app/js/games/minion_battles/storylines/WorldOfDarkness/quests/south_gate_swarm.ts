/**
 * South Gate Swarm — single-mission side quest. Dedicated chapter 2 map node; not a plains
 * quest, so it does not count toward Surface Quests.
 */

import type { QuestDef } from '../../questTypes';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { SouthGateSwarmMission } from '../missions/006c_south_gate_swarm';
import { QUEST_SOUTH_GATE_SWARM_MISSION_ID } from '../questMissions/quest_south_gate_swarm';

export const SOUTH_GATE_SWARM_QUEST_ID = 'south_gate_swarm';

export const SOUTH_GATE_SWARM_QUEST: QuestDef = {
    id: SOUTH_GATE_SWARM_QUEST_ID,
    title: SouthGateSwarmMission.nameStr,
    description: 'Something has nested beyond the southern gate. Tear it down.',
    campaignId: 'world_of_darkness',
    prepBackgroundImage: STORY_BACKGROUNDS.campfire,
    tags: ['post_core_awakening'],
    slots: [{ kind: 'fixed', missionId: QUEST_SOUTH_GATE_SWARM_MISSION_ID }],
};
