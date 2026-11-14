/**
 * Forage the Garden - chapter 3 scavenging quest. Dedicated castle map node (on the ice house),
 * unlocked by The Overgrown Garden: forage the herb beds and orchard, then search the ice house's
 * cold stores (Hunger recovery plus an eat-or-pack pick).
 */

import type { QuestDef } from '../../questTypes';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { FORAGE_THE_GARDEN_COMPLETION_VIGOR, LOCATION_CASTLE_TAG } from '../questMissions/questMissionConstants';
import { QUEST_CASTLE_HERB_BEDS_MISSION_ID } from '../questMissions/quest_castle_herb_beds';
import { QUEST_CASTLE_ICE_HOUSE_MISSION_ID } from '../questMissions/quest_castle_ice_house';

export const FORAGE_THE_GARDEN_QUEST_ID = 'forage_the_garden';

export const FORAGE_THE_GARDEN: QuestDef = {
    id: FORAGE_THE_GARDEN_QUEST_ID,
    // TODO(story): placeholder title and description.
    title: 'Forage the Garden',
    description: 'The garden has run wild, and the ice house beside it may still hold food.',
    campaignId: 'world_of_darkness',
    prepBackgroundImage: STORY_BACKGROUNDS.campfire,
    tags: [LOCATION_CASTLE_TAG],
    slots: [
        { kind: 'fixed', missionId: QUEST_CASTLE_HERB_BEDS_MISSION_ID },
        { kind: 'fixed', missionId: QUEST_CASTLE_ICE_HOUSE_MISSION_ID },
    ],
    completionRewards: {
        resourceDelta: { vigor: FORAGE_THE_GARDEN_COMPLETION_VIGOR },
    },
};
