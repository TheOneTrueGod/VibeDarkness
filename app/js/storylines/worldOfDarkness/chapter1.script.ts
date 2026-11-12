/**
 * World of Darkness, chapter I — A Dark Awakening through Core Awakening.
 * Edit mission copy here. Mission classes import their entry.
 *
 * Towards the Light appends a weapon choice after `postMissionStory`. Those row
 * labels come from the item defs (`CAVE_WEAPON_ITEM_IDS`), not from this file.
 * Core Awakening's choice rows are built from research-tree titles. Cave Respite's
 * punch rows are filtered by the equipped weapon; the words are `CAVE_RESPITE_PUNCH_CHOICES`.
 */

import type { MissionScript, StoryChoiceCopy } from '../missionScript';
import { STORY_BACKGROUNDS } from '../../games/minion_battles/assets/story';
import type { PostMissionStoryDef, PreMissionStoryDef } from '../../games/minion_battles/storylines/storyTypes';
import {
    TRAINING_NODE_CHARGING_PUNCH,
    TRAINING_NODE_DOUBLE_PUNCH,
    TRAINING_NODE_SNEAKY_PUNCH,
    TRAINING_NODE_STRONG_PUNCH,
} from '../../researchTrees/trees/training';

/** Hunger recovered in the post-mission feast (clamped to max Hunger). */
export const LIGHT_EMPOWERED_HUNGER_RECOVERY = 100;

/** Hunger each player's character recovers on defeating the Alpha Wolf (clamped at max Hunger). */
export const MONSTER_HUNGER_RECOVERY = 100;

const DARK_AWAKENING_PRE: PreMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: "Welcome to my game, and thanks for playing!  I will be your DM for this story.",
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'Wake Up',
            textEffect: 'title_bounce',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: [
                'You open your eyes to find a campfire crackling before you.',
                'Beyond the glow, darkness presses in, along with the sounds of movement and growling.',
                'With little time to remember where you are, you push yourself up and scan the camp for weapons.',
            ].join('\n'),
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'choice',
            choiceId: 'dark_awakening_weapon',
            backgroundImage: STORY_BACKGROUNDS.campfire,
            options: [
                {
                    id: 'rocks',
                    label: 'Grab some nearby rocks',
                    action: { type: 'equip_item', itemId: '001' },
                },
                {
                    id: 'torch',
                    label: 'Grab a thick branch',
                    action: { type: 'equip_item', itemId: '002' },
                },
            ],
        },
    ],
};

/** Lines before the cave weapon choice. The mission appends that choice. */
const TOWARDS_THE_LIGHT_POST: PostMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: [
                'You run toward the light, desperate to get away from the flickering darkness.',
                "You turn, expecting a fight, but the crystals' light burns and drives back any wolf that dares to follow you in.",
            ].join('\n'),
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'You take a moment to steady yourself. Inside the cave, the walls are studded with glittering crystals. They pulse softly, like distant stars.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: [
                'In the center, a cauldron sits over a firepit, wood stacked nearby',
                'In one corner: bones, scraps of cloth, rusted tools and armour. Someone was here before.',
                'You figure now is as good a time as any to catch your breath. What would you like to do with this moment of respite?',
            ].join('\n'),
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
    ],
};

const LIGHT_EMPOWERED_POST: PostMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: "The boar falls. You drag the carcass back through the path, past the wolves that snap at your heels. At last you reach the cave, where the crystals' light burns and drives back any wolf that dares to follow you in.",
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'You butcher the meat and share it around. For the first time in what feels like an age, your hunger is sated. The crystals pulse gently. You have survived another trial.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        { type: 'recover_hunger_auto', amount: LIGHT_EMPOWERED_HUNGER_RECOVERY },
    ],
};

/** Shown by Cave Respite's choice builder. Charging Punch is omitted unless Charged Rocks is equipped. */
export const CAVE_RESPITE_PUNCH_CHOICES: Record<string, StoryChoiceCopy> = {
    [TRAINING_NODE_CHARGING_PUNCH]: {
        label: 'Charging Punch',
        loreTitle: 'Crystal Rhythm',
        loreDescription: 'The crystals keep your rhythm. Each hit stores 1 Light Charge.',
    },
    [TRAINING_NODE_SNEAKY_PUNCH]: {
        label: 'Sneaky Punch',
        loreTitle: 'Strike the Opening',
        loreDescription: 'Wait for a clean opening. Extra damage to stunned enemies.',
    },
    [TRAINING_NODE_STRONG_PUNCH]: {
        label: 'Strong Punch',
        loreTitle: 'Brace and Hit',
        loreDescription: 'Plant your feet and drive through. Stun and knock enemies back.',
    },
    [TRAINING_NODE_DOUBLE_PUNCH]: {
        label: 'Double Punch',
        loreTitle: 'Two Quick Blows',
        loreDescription: 'Tight paths train fast follow-ups. Strike two enemies in sequence.',
    },
};

const MONSTER_POST: PostMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: "You defeat the Beast, but something is different.  You feel... power.  Like things won't be the same anymore.",
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        { type: 'recover_hunger_auto', amount: MONSTER_HUNGER_RECOVERY },
    ],
};

const CORE_AWAKENING_POST: PostMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: [
                'The Beast is defeated. The cave falls silent, and your breath steadies in the dark.',
                'As the beast falls, you feel a new power stirring awake within you, answering the clash you survived.',
                'Choose the core you will awaken next.',
            ].join('\n'),
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.forestLight,
        },
        {
            type: 'choice',
            choiceId: 'core_awakening_reward',
            backgroundImage: STORY_BACKGROUNDS.forestLight,
            // Rows come from getPostMissionChoiceOptions. Labels are core titles.
            options: [],
        },
    ],
};

export const chapter1Scripts = {
    dark_awakening: {
        name: 'A Dark Awakening',
        description: 'You awaken in darkness with no memory. Survive the first night and find a way forward.',
        objectives: {
            survive_wolves: 'Survive the wolves',
            eliminate_enemies: 'Eliminate all enemies to win',
        },
        preMissionStory: DARK_AWAKENING_PRE,
    },
    towards_the_light: {
        name: 'Towards the Light',
        description: 'Push through the crystal caves toward a faint glow. Something ancient stirs in the dark.',
        objectives: {
            find_safety: 'Find safety — reach the light in the cave to the east with your whole party',
        },
        preMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: "The darkness does not appear to be letting up, and the campfire is starting to grow dim.\n\nIt's time to light a torch and find somewhere safe.",
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
            ],
        },
        postMissionStory: TOWARDS_THE_LIGHT_POST,
    },
    light_empowered: {
        name: 'Find some food',
        description: 'Forage for supplies in the lit passages. Territorial creatures guard the food sources.',
        objectives: {
            kill_boar: 'Hunt and kill the boar',
            return_cave: 'Return to the cave with your party',
        },
        preMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'Your stomach growls. The crystals glow softly in the cave, but they cannot fill an empty belly. You need to venture out and find food.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: "You've seen tracks in the dirt—something large, something that could feed you all. A boar, perhaps. It's time to hunt.",
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
            ],
        },
        postMissionStory: LIGHT_EMPOWERED_POST,
    },
    cave_respite: {
        name: 'Cave respite',
        description: 'A rare moment of rest in a hidden alcove. Choose wisely how to spend your time.',
        postMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'The cave holds you. Outside, the dark still hunts—but in here, by the faint light, you are safe for now.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'You settle in and share another meal while it lasts. The quiet feels borrowed—enough room to sharpen body and gear alike.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
                {
                    type: 'choice',
                    choiceId: 'cave_respite_punch_choice',
                    options: [],
                },
            ],
        },
    },
    monster: {
        name: 'Monster',
        description: 'The pack leader hunts these tunnels. Confront the beast directly — or be hunted forever.',
        playerControlLabel: 'Control Alpha Wolf',
        preMissionStory: {
            phrases: [
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'A loud growl echoes from beyond the cave mouth. Something has found you.  Something patient... Something hungry',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
                {
                    type: 'dialogue',
                    speakerId: '1',
                    text: 'The Beast has come. There is no retreat... only the fight.',
                    portraitSide: 'left',
                    backgroundImage: STORY_BACKGROUNDS.campfire,
                },
            ],
        },
        postMissionStory: MONSTER_POST,
    },
    core_awakening: {
        name: 'Core Awakening',
        description: 'A deep resonance stirs within. An awakening that will change the path ahead.',
        postMissionStory: CORE_AWAKENING_POST,
    },
} satisfies Record<string, MissionScript>;
