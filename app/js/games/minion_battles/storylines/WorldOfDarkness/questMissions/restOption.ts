/**
 * Shared "Rest" post-mission choice for random-story bag missions: recover Hunger.
 */

import type { StoryChoiceOptionRow } from '../../storyTypes';
import { REST_HUNGER_RECOVERY, REST_LABEL, REST_OPTION_ID } from './questMissionConstants';

export function buildRestOption(amount: number = REST_HUNGER_RECOVERY): StoryChoiceOptionRow {
    return {
        id: REST_OPTION_ID,
        label: REST_LABEL,
        loreTitle: REST_LABEL,
        loreDescription: 'Take a moment to catch your breath and eat.',
        action: { type: 'recover_hunger', amount },
    };
}
