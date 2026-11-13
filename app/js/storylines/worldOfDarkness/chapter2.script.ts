/**
 * World of Darkness, chapter II — The Surface.
 * Both campsites share one script. Displacer follows them.
 */

import type { MissionScript } from '../missionScript';
import { STORY_BACKGROUNDS } from '../../games/minion_battles/assets/story';
import type { PostMissionStoryDef, ResearchRewardSlot } from '../../games/minion_battles/storylines/storyTypes';

export const CAMPSITE_CHOICE_ID = 'campsite_research_choice';
export const CAMPSITE_HUNGER_RECOVERY = 20;
/** Core picks offered at a campsite, at most. */
export const CAMPSITE_CORE_PICKS = 6;
/** Chapter 2 campsites only grant rank 11 core research: the first set of abilities in each core tree. */
export const CAMPSITE_RESEARCH_MIN_TIER = 11;
export const CAMPSITE_RESEARCH_MAX_TIER = 11;
/**
 * Random core reward slots. The choice grid fills row-major from the top left, so the picks run
 * across and then down. A slot with no core research left is dropped, keeping the rest packed.
 */
export const CAMPSITE_RESEARCH_SLOTS: ResearchRewardSlot[] = Array.from(
    { length: CAMPSITE_CORE_PICKS },
    () => ({
        tag: 'core' as const,
        random: true,
        omitWhenUnavailable: true,
        minTier: CAMPSITE_RESEARCH_MIN_TIER,
        maxTier: CAMPSITE_RESEARCH_MAX_TIER,
    }),
);
export const CAMPSITE_RESEARCH_OPTION_COUNT = CAMPSITE_RESEARCH_SLOTS.length;
export const CAMPSITE_INTRO_TEXT = 'You have discovered a campsite';

const CAMPSITE_POST: PostMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: CAMPSITE_INTRO_TEXT,
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        { type: 'recover_hunger_auto', amount: CAMPSITE_HUNGER_RECOVERY },
        {
            type: 'choice',
            choiceId: CAMPSITE_CHOICE_ID,
            backgroundImage: STORY_BACKGROUNDS.campfire,
            options: [],
            researchRewardSlots: CAMPSITE_RESEARCH_SLOTS,
        },
    ],
};

const campsiteScript: MissionScript = {
    name: 'Campsite',
    description: `A place to rest. Recover ${CAMPSITE_HUNGER_RECOVERY} Hunger and pick one of ${CAMPSITE_RESEARCH_OPTION_COUNT} free upgrades (weapon, stat or core).`,
    postMissionStory: CAMPSITE_POST,
};

export const chapter2Scripts = {
    campsite: campsiteScript,
    campsite_2: campsiteScript,
    displacer: {
        name: 'Displacer',
        description: 'A spirit flickers in the lit circle. Its bolts fly farther than they seem to aim.',
        objectives: {
            defeat_displacer: 'Defeat the Displacer Spirit',
        },
    },
} satisfies Record<string, MissionScript>;
