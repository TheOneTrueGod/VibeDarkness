/**
 * World of Darkness missions that are not on a chapter spine: quest-only battles,
 * quest copies (name and description overrides; the lines stay on the parent), and
 * plains random-story beats.
 *
 * Shared choice rows (Rest, Search for loose metals) are edited here and read by
 * the option builders. Found Berries inlines that metals row so the beat reads
 * in order. Surface metal's rows are built at runtime (Earth Core gate).
 */

import type { MissionScript, StoryChoiceCopy } from '../missionScript';
import { STORY_BACKGROUNDS } from '../../games/minion_battles/assets/story';
import type { PostMissionStoryDef } from '../../games/minion_battles/storylines/storyTypes';
import {
    FOUND_BERRIES_EAT_HUNGER_RECOVERY,
    FOUND_BERRIES_KEEP_VIGOR,
    REQUIRES_EARTH_CORE_LABEL,
    SEARCH_FOR_LOOSE_METALS_OPTION_ID,
    SURFACE_METAL_EXTRACT_OTHERS_METAL,
    SURFACE_METAL_HARVEST_METAL,
} from '../../games/minion_battles/storylines/WorldOfDarkness/questMissions/questMissionConstants';

export const searchForLooseMetalsText = {
    label: 'Search for loose metals',
    loreDescription: "There's bound to be some nearby.",
} as const satisfies Pick<StoryChoiceCopy, 'label' | 'loreDescription'>;

export const restChoiceText = {
    label: 'Rest',
    loreDescription: 'Take a moment to catch your breath and eat.',
} as const satisfies Pick<StoryChoiceCopy, 'label' | 'loreDescription'>;

export const SURFACE_METAL_EXTRACT_COPY = {
    label: 'Extract Metal',
    loreTitle: 'Extract Metal',
    enabledLoreDescription: `Earth Core lets you pull deeper veins. Each other player also gains +${SURFACE_METAL_EXTRACT_OTHERS_METAL} Metal.`,
    disabledLoreDescription: `${REQUIRES_EARTH_CORE_LABEL}.`,
} as const;

export const FOUND_BERRIES_CHOICE_ID = 'found_berries_choice';
export const FOUND_BERRIES_OPTION_EAT = 'eat_berries';
export const FOUND_BERRIES_OPTION_KEEP = 'keep_berries';
export const FOUND_BERRIES_EAT_LABEL = 'Eat the Berries';
export const FOUND_BERRIES_KEEP_LABEL = 'Keep the Berries';
export const SURFACE_METAL_CHOICE_ID = 'surface_metal_choice';
export const SWARMLING_NEST_NAME = 'Swarmling Nest';
export const SWARMLING_NEST_OBJECTIVE_LABEL = 'Destroy the nest';
export const QUEST_PUSH_NORTH_NAME = 'Push North';
export const QUEST_PUSH_NORTH_OBJECTIVE_LABEL = 'Reach the northern path';

/** In-battle lines as each corrupted crystal recovers, in round order. */
export const QUEST_CRYSTAL_RECOVERY_LINES = [
    'A crystal flickers back to life.',
    'Another crystal sheds its corruption.',
    'The cave grows brighter.',
    'The protection is returning.',
    'The last crystal shines again. Kill the remaining enemies!',
] as const;

const FOUND_BERRIES_POST: PostMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'A low thicket catches your eye — ripe berries, still cool from the night air. Enough to matter, if you choose carefully.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'choice',
            choiceId: FOUND_BERRIES_CHOICE_ID,
            backgroundImage: STORY_BACKGROUNDS.foundBerries,
            options: [
                {
                    id: FOUND_BERRIES_OPTION_EAT,
                    label: FOUND_BERRIES_EAT_LABEL,
                    loreTitle: FOUND_BERRIES_EAT_LABEL,
                    loreDescription: 'Sate your hunger.',
                    action: { type: 'recover_hunger', amount: FOUND_BERRIES_EAT_HUNGER_RECOVERY },
                },
                {
                    id: FOUND_BERRIES_OPTION_KEEP,
                    label: FOUND_BERRIES_KEEP_LABEL,
                    loreTitle: FOUND_BERRIES_KEEP_LABEL,
                    loreDescription: 'Pack them carefully.',
                    action: { type: 'grant_resources', vigor: FOUND_BERRIES_KEEP_VIGOR },
                },
                {
                    id: SEARCH_FOR_LOOSE_METALS_OPTION_ID,
                    label: searchForLooseMetalsText.label,
                    loreTitle: searchForLooseMetalsText.label,
                    loreDescription: searchForLooseMetalsText.loreDescription,
                    action: { type: 'grant_resources', metal: SURFACE_METAL_HARVEST_METAL },
                },
            ],
        },
    ],
};

export const questScripts = {
    ember_threshold: {
        name: 'Ember at the Threshold',
        description: 'Hold the threshold against relentless waves of shadow creatures. The line must not break.',
        objectives: {
            find_first_nest: 'Find out what the creatures are doing',
            find_second_nest: 'Follow the glowing creatures',
            survive_1_round: 'Survive 1 more round',
        },
        preMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: "You spot lights drifting south through the dark, moving with quiet purpose. You've got little else to do, so you follow them.",
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
            ],
        },
        postMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'The glowing insects have made their home. Two nests now glow in the dark—small fires of life holding back the shadow.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
            ],
        },
    },
    thorn_march: {
        name: 'Thorn March',
        description: 'March through the thornwood and dismantle the nest at its heart before the swarm spreads.',
        objectives: {
            establish_all_nests: 'Protect the plant-creatures as they build their network',
            hold_the_line: 'Hold all three nests for 2 more rounds',
        },
        preMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'The nest in the glade still pulses with light—untouchable. But the glowing insects are not staying. Small flames drift south into the thorns. Whatever they are building, they need you to follow.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
            ],
        },
        postMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'Three nests. Three lights in the dark. The little lights have driven roots deep into the thorn path—and the darkness has not snuffed them out.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
            ],
        },
    },
    // Quest copies. Dialogue stays on the parent mission; only the card title and blurb change.
    quest_ember_threshold: {
        name: 'Quest: Ember at the Threshold',
        description: 'Quest variant of the threshold — follow the glowing scouts while the run is locked.',
    },
    quest_thorn_march: {
        name: 'Quest: Thorn March',
        description: 'Quest variant of the thornwood march — hold the glowing nests as a step in a locked run.',
    },
    quest_find_some_food: {
        name: 'Quest: Find some food',
        description: 'Quest variant of the plains hunt — forage and fight for food while the run is locked.',
    },
    quest_crystal_corruption: {
        name: 'Quest: Crystal Corruption',
        description: 'The cave crystals have turned dark. Hold the cave while they recover, one by one.',
        preMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'You return to the cave to find every crystal dark, pulsing with corruption. The howling is close behind you.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'Deep inside, a faint light still stirs. Hold the cave long enough, and the crystals may recover.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
            ],
        },
        postMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'The last of them falls. Around you, the crystals glow clean and bright once more.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
            ],
        },
    },
    quest_push_north: {
        name: QUEST_PUSH_NORTH_NAME,
        description: 'Follow the swarm north along the cliff path.',
        objectives: {
            reach_north: QUEST_PUSH_NORTH_OBJECTIVE_LABEL,
        },
        preMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: [
                        'The skittering swarm keeps pouring in from the north.',
                        "Fight your way through to find out where they're coming from.",
                    ].join('\n'),
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
            ],
        },
        postMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'Continue your march.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
            ],
        },
    },
    swarmling_nest: {
        name: SWARMLING_NEST_NAME,
        description: 'The swarm leads here. Destroy the nest.',
        objectives: {
            clear_arena: SWARMLING_NEST_OBJECTIVE_LABEL,
        },
        preMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'The trail ends at a dirt circle. Skittering things boil out of a nest at the centre.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
            ],
        },
        postMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'The nest splits open and goes still. You have a feeling that this is just the beginning.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
            ],
        },
    },
    found_berries: {
        name: 'Found Berries',
        description: 'A chance find on the plains — berries worth eating or keeping.',
        postMissionStory: FOUND_BERRIES_POST,
    },
    // Choice rows (harvest, extract, rest) are filled in getPostMissionChoiceOptions.
    surface_metal_deposit: {
        name: 'Surface metal deposit',
        description: 'A surface seam of metal on the plains — harvest, extract, or rest.',
        postMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'Wind has stripped the soil from a dark seam of metal. It is close enough to work — or to walk past.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
                {
                    type: 'choice',
                    choiceId: SURFACE_METAL_CHOICE_ID,
                    backgroundImage: STORY_BACKGROUNDS.surfaceMetalDeposit,
                    options: [],
                },
            ],
        },
    },
} satisfies Record<string, MissionScript>;
