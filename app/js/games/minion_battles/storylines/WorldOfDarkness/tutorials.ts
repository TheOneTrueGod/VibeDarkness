/** World of Darkness tutorials. Registered in `storylines/tutorialRegistry.ts`; see `tutorials/tutorialTypes.ts`. */
import {
    KNOWLEDGE_TUTORIAL_BATTLE_BASICS,
    KNOWLEDGE_TUTORIAL_COMBOS,
    KNOWLEDGE_TUTORIAL_CRYSTALS,
    KNOWLEDGE_TUTORIAL_CC_RESISTANCE,
    KNOWLEDGE_TUTORIAL_JUGGERNAUT_FRAMES,
    KNOWLEDGE_REACTIONS,
    KNOWLEDGE_TUTORIAL_LIGHT,
    KNOWLEDGE_TUTORIAL_REACTIONS,
    KNOWLEDGE_TUTORIAL_STACKED_UNITS,
} from '../../../../accountKnowledge';
import type { TutorialDef } from '../../tutorials/tutorialTypes';
import { ENEMY_ALPHA_WOLF, ENEMY_DARK_WOLF } from '../../constants/enemyConstants';
import { DARK_AWAKENING } from './missions/001_dark_awakening';
import { TOWARDS_THE_LIGHT } from './missions/002_towards_the_light';
import { LIGHT_EMPOWERED } from './missions/003_light_empowered';
import { TRAINING_GROUNDS_MISSION_ID } from './missions/017_training_grounds';
import { staticSpecifiedAbilityIds } from '../../../../researchTrees/abilitySpecification';
import { PUNCH_LINE_SPEC, WEAPON_BASIC_ABILITIES_SPEC } from '../../../../researchTrees/trees/weapons';

const PUNCH_ABILITY_ID = '0120';
const THROW_TORCH_ABILITY_ID = '0601';

/** Mission 1 opening: a wolf is already on its way. Teaches moving, then pairing an attack with a move. */
export const TUTORIAL_FIRST_BATTLE: TutorialDef = {
    id: 'first_battle',
    knowledgeKey: KNOWLEDGE_TUTORIAL_BATTLE_BASICS,
    title: 'Your first fight',
    trigger: { type: 'battleStart', missionId: DARK_AWAKENING.missionId },
    steps: [
        {
            text: 'This wolf is about to attack you! Right click to pick somewhere out of the way to move to.',
            pointAt: { type: 'unit', characterId: ENEMY_DARK_WOLF.characterId },
            advance: { type: 'localOrder', withMove: true },
        },
        {
            text: 'You can pick an attack and a movement target. Use Punch, and see how you move towards your target afterwards.',
            pointAt: { type: 'abilityCard', abilityIds: [PUNCH_ABILITY_ID] },
            advance: { type: 'localOrder', abilityIds: [PUNCH_ABILITY_ID] },
        },
    ],
};

/** Mission 2 opening: the campfire is fading, so the party needs its own light on the way east. */
export const TUTORIAL_LIGHT: TutorialDef = {
    id: 'light_intro',
    knowledgeKey: KNOWLEDGE_TUTORIAL_LIGHT,
    title: 'Light',
    trigger: { type: 'battleStart', missionId: TOWARDS_THE_LIGHT.missionId },
    steps: [
        {
            text: 'Your campfire is dimming. When its light fades, the darkness and everything in it will close in.',
            pointAt: { type: 'specialTile', defId: 'Campfire' },
            advance: { type: 'next' },
        },
        {
            text: 'You can put down more light with a torch. Throw it, and it keeps burning where it lands.',
            pointAt: { type: 'abilityCard', abilityIds: [THROW_TORCH_ABILITY_ID] },
            advance: { type: 'next' },
        },
        {
            text: 'Safety lies somewhere to the east. Good luck.',
            advance: { type: 'next', label: 'Good luck' },
        },
    ],
};

/** Mission 3 opening: the party starts in the crystal cave. Crystal DayLight burns dark creatures. */
export const TUTORIAL_CRYSTALS: TutorialDef = {
    id: 'crystals_intro',
    knowledgeKey: KNOWLEDGE_TUTORIAL_CRYSTALS,
    title: 'Crystals',
    trigger: { type: 'battleStart', missionId: LIGHT_EMPOWERED.missionId },
    steps: [
        {
            text: 'These crystals shine with a pure light. Creatures of darkness that stand in it are burned and take damage.',
            pointAt: { type: 'specialTile', defId: 'Crystal' },
            advance: { type: 'next' },
        },
    ],
};

/** The first time an enemy unit stack is on screen (first met in The Lonely Castle). */
export const TUTORIAL_STACKED_UNITS: TutorialDef = {
    id: 'stacked_units',
    knowledgeKey: KNOWLEDGE_TUTORIAL_STACKED_UNITS,
    title: 'Stacked units',
    trigger: { type: 'unitOnScreen', unit: { minStackSize: 2, hostile: true } },
    steps: [
        {
            text:
                'This token is a stack of {stackSize} units. The more of them there are, the more damage it deals. ' +
                'Every time you deal enough damage to kill one of them, the stack count goes down by one.',
            pointAt: { type: 'unit', minStackSize: 2, hostile: true },
            advance: { type: 'next' },
        },
    ],
};

/** The first time a CC-resistant boss is on screen (the alpha wolf, mission 005): points at its protection circles. */
export const TUTORIAL_CC_RESISTANCE: TutorialDef = {
    id: 'cc_resistance',
    knowledgeKey: KNOWLEDGE_TUTORIAL_CC_RESISTANCE,
    title: 'Crowd control resistance',
    trigger: { type: 'unitOnScreen', unit: { characterId: ENEMY_ALPHA_WOLF.characterId, hostile: true } },
    steps: [
        {
            text:
                'Stuns, knockbacks and similar effects can crack this boss open.\n' +
                'Land 3 strong ones and it is exposed, taking double damage. Until then it shrugs off the first 2 strong effects, and weak ones bounce right off.',
            pointAt: { type: 'hudAnchor', anchorId: 'bossCcArmour' },
            advance: { type: 'next' },
        },
        {
            text: 'Each strong effect you land fills a circle, so you can see exactly how close you are to the exposed window.',
            pointAt: { type: 'hudAnchor', anchorId: 'bossCcArmour' },
            advance: { type: 'next' },
        },
    ],
};

/** The first time the alpha wolf (mission 005) enrages at low health. Holds the game for this player until dismissed. */
export const TUTORIAL_ALPHA_ENRAGE: TutorialDef = {
    id: 'alpha_enrage',
    knowledgeKey: KNOWLEDGE_TUTORIAL_CC_RESISTANCE,
    title: 'Enrage',
    trigger: { type: 'unitOnScreen', unit: { characterId: ENEMY_ALPHA_WOLF.characterId, hostile: true, enraged: true } },
    pauseGame: true,
    steps: [
        {
            text:
                'The alpha is nearly beaten, and it has gone into a frenzy! You have it on the ropes.\n' +
                'It now charges three times in quick succession, so keep moving and finish it off.',
            pointAt: { type: 'unit', characterId: ENEMY_ALPHA_WOLF.characterId, hostile: true, enraged: true },
            advance: { type: 'next', label: 'Got it' },
        },
    ],
};

/**
 * The first time an enemy's juggernaut border shows (the alpha wolf's first juggernaut frames). Holds the
 * game for this player until they dismiss it.
 */
export const TUTORIAL_JUGGERNAUT_FRAMES: TutorialDef = {
    id: 'juggernaut_frames',
    knowledgeKey: KNOWLEDGE_TUTORIAL_JUGGERNAUT_FRAMES,
    title: 'Juggernaut frames',
    trigger: { type: 'unitOnScreen', unit: { hostile: true, inJuggernautWindow: true } },
    pauseGame: true,
    steps: [
        {
            text: 'This enemy has {Juggernaut} armour, and is immune to all stuns and knockbacks.',
            pointAt: { type: 'unit', hostile: true, inJuggernautWindow: true },
            advance: { type: 'next' },
        },
    ],
};

/**
 * The first reaction pause a player who knows Reactions gets (the Garden Heart grants it). Holds the game
 * for this player until dismissed. Pointers resolve once Step 13 registers the HUD anchors; until then the
 * text shows without them.
 */
export const TUTORIAL_REACTIONS: TutorialDef = {
    id: 'reactions_intro',
    knowledgeKey: KNOWLEDGE_TUTORIAL_REACTIONS,
    requiresKnowledge: KNOWLEDGE_REACTIONS,
    title: 'Reactions',
    trigger: { type: 'reactionPause' },
    pauseGame: true,
    steps: [
        {
            text: 'An enemy attack is about to land on you. Time stops here so you can react.',
            pointAt: { type: 'hudAnchor', anchorId: 'reactionMark' },
            advance: { type: 'next' },
        },
        {
            text: 'Reflex lets you act during a reaction. You get 1 Reflex back each round.',
            pointAt: { type: 'hudAnchor', anchorId: 'reflexDisplay' },
            advance: { type: 'next' },
        },
        {
            text: 'Pick an ability to spend 1 Reflex and interrupt your current action.\nPass to spend nothing.',
            pointAt: { type: 'hudAnchor', anchorId: 'abilityBar' },
            advance: { type: 'next', label: 'Got it' },
        },
    ],
};

/**
 * The Training Grounds opening, where Combos unlock (the mission grants Flurry before the fight). Shown
 * whether or not the player already had Flurry. Points at the player's weapon ability.
 */
export const TUTORIAL_COMBOS: TutorialDef = {
    id: 'combos_intro',
    knowledgeKey: KNOWLEDGE_TUTORIAL_COMBOS,
    title: 'Combos',
    trigger: { type: 'battleStart', missionId: TRAINING_GROUNDS_MISSION_ID },
    steps: [
        {
            text: "Your weapon's basic ability and your punch now have {Combo}.",
            pointAt: {
                type: 'abilityCard',
                abilityIds: [
                    ...(staticSpecifiedAbilityIds(WEAPON_BASIC_ABILITIES_SPEC) ?? []),
                    ...(staticSpecifiedAbilityIds(PUNCH_LINE_SPEC) ?? []),
                ],
            },
            advance: { type: 'next' },
        },
        {
            text:
                'When a {Combo} attack finishes, you can use it again right away instead of waiting. ' +
                'Each follow-up chains on, so you can keep attacking.',
            advance: { type: 'next', label: 'Got it' },
        },
    ],
};

export const WORLD_OF_DARKNESS_TUTORIALS: readonly TutorialDef[] = [
    TUTORIAL_FIRST_BATTLE,
    TUTORIAL_LIGHT,
    TUTORIAL_CRYSTALS,
    TUTORIAL_STACKED_UNITS,
    TUTORIAL_CC_RESISTANCE,
    TUTORIAL_ALPHA_ENRAGE,
    TUTORIAL_JUGGERNAUT_FRAMES,
    TUTORIAL_REACTIONS,
    TUTORIAL_COMBOS,
];
