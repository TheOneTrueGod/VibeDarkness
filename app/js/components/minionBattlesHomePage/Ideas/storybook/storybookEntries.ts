import type { StorybookEntry } from './storybookTypes';
import { RESOURCES_STORY } from './entries/resourcesStory';
import { RESEARCH_CARDS_STORY } from './entries/researchCardsStory';

/**
 * Storybook entries, in left-list order. To add one, write an `entries/<name>Story.tsx` exporting a
 * {@link StorybookEntry} (render the real game components, never copies) and list it here.
 */
export const STORYBOOK_ENTRIES: readonly StorybookEntry[] = [RESOURCES_STORY, RESEARCH_CARDS_STORY];
