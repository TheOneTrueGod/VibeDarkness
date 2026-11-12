/**
 * Shared "Rest" post-mission choice for random-story bag missions: recover Hunger.
 */

import type { StoryChoiceOptionRow } from '../../storyTypes';
import { restChoiceText } from '../../../../../storylines/worldOfDarkness/quests.script';
import { REST_HUNGER_RECOVERY, REST_OPTION_ID } from './questMissionConstants';

export function buildRestOption(amount: number = REST_HUNGER_RECOVERY): StoryChoiceOptionRow {
    return {
        id: REST_OPTION_ID,
        label: restChoiceText.label,
        loreTitle: restChoiceText.label,
        loreDescription: restChoiceText.loreDescription,
        action: { type: 'recover_hunger', amount },
    };
}
