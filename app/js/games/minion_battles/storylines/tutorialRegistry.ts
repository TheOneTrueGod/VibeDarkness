/** Every tutorial in the game. See `tutorials/tutorialTypes.ts`. */
import type { TutorialDef } from '../tutorials/tutorialTypes';
import { WORLD_OF_DARKNESS_TUTORIALS } from './WorldOfDarkness/tutorials';

export const TUTORIALS: readonly TutorialDef[] = [...WORLD_OF_DARKNESS_TUTORIALS];

/** Tutorials carried by a knowledge key (zero, one or more). */
export function tutorialsForKnowledge(key: string): TutorialDef[] {
    return TUTORIALS.filter((t) => t.knowledgeKey === key);
}
