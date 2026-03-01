/**
 * Storyline registry and mission map for campaign UI and battle phase.
 */

import type { StorylineDef } from './types';
import type { IBaseMissionDef } from './BaseMissionDef';
import { WorldOfDarknessStoryline } from './WorldOfDarkness/WorldOfDarkness';
import { BunkerAtTheEndStoryline } from './BunkerAtTheEnd/BunkerAtTheEnd';
import { DARK_AWAKENING } from './WorldOfDarkness/missions/dark_awakening';
import { LAST_HOLDOUT } from './BunkerAtTheEnd/missions/last_holdout';

/** Default mission when missionId is unknown (e.g. fallback in BattlePhase). */
export { DARK_AWAKENING };

export const STORYLINES: StorylineDef[] = [
    WorldOfDarknessStoryline,
    BunkerAtTheEndStoryline,
];

export const MISSION_MAP: Record<string, IBaseMissionDef> = {
    dark_awakening: DARK_AWAKENING,
    last_holdout: LAST_HOLDOUT,
};

export type { StorylineDef, StorylineFlowEdge } from './types';
export { getUnlockedMissionIds, isMissionCompleted } from './unlock';
