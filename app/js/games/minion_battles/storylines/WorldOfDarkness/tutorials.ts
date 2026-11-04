/** World of Darkness tutorials. Registered in `storylines/tutorialRegistry.ts`; see `tutorials/tutorialTypes.ts`. */
import { KNOWLEDGE_TUTORIAL_BATTLE_BASICS, KNOWLEDGE_TUTORIAL_LIGHT } from '../../../../accountKnowledge';
import type { TutorialDef } from '../../tutorials/tutorialTypes';
import { ENEMY_DARK_WOLF } from '../../constants/enemyConstants';
import { DARK_AWAKENING } from './missions/001_dark_awakening';
import { TOWARDS_THE_LIGHT } from './missions/002_towards_the_light';

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

export const WORLD_OF_DARKNESS_TUTORIALS: readonly TutorialDef[] = [TUTORIAL_FIRST_BATTLE, TUTORIAL_LIGHT];
