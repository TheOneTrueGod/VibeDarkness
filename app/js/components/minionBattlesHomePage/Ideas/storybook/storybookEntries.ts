import type { StorybookEntry } from './storybookTypes';
import { RESOURCES_STORY } from './entries/resourcesStory';
import { RESEARCH_CARDS_STORY } from './entries/researchCardsStory';
import { GARDEN_HEART_STORY } from './entries/gardenHeartStory';
import { TERRAIN_STORY } from './entries/terrainStory';

/**
 * Storybook entries, in left-list order. To add one, write an `entries/<name>Story.tsx` exporting a
 * {@link StorybookEntry} (render the real game components, never copies) and list it here.
 */
export const STORYBOOK_ENTRIES: readonly StorybookEntry[] = [RESOURCES_STORY, RESEARCH_CARDS_STORY, GARDEN_HEART_STORY, TERRAIN_STORY];
