/**
 * Storyline registry and mission map for campaign UI and battle phase.
 */

import type { StorylineDef } from './types';
import type { IBaseMissionDef } from './BaseMissionDef';
import { WorldOfDarknessStoryline } from './WorldOfDarkness/WorldOfDarkness';
import { BunkerAtTheEndStoryline } from './BunkerAtTheEnd/BunkerAtTheEnd';
import { DARK_AWAKENING } from './WorldOfDarkness/missions/001_dark_awakening';
import { TOWARDS_THE_LIGHT } from './WorldOfDarkness/missions/002_towards_the_light';
import { LIGHT_EMPOWERED } from './WorldOfDarkness/missions/003_light_empowered';
import { CAVE_RESPITE } from './WorldOfDarkness/missions/004_cave_respite';
import { MONSTER } from './WorldOfDarkness/missions/005_monster';
import { CORE_AWAKENING } from './WorldOfDarkness/missions/006_core_awakening';
import { EMBER_THRESHOLD } from './WorldOfDarkness/missions/007_ember_threshold';
import { LAST_HOLDOUT } from './BunkerAtTheEnd/missions/last_holdout';

/** Default mission when missionId is unknown (e.g. fallback in BattlePhase). */
export { DARK_AWAKENING };

export const STORYLINES: StorylineDef[] = [
    WorldOfDarknessStoryline,
    BunkerAtTheEndStoryline,
];

export const MISSION_MAP: Record<string, IBaseMissionDef> = {
    dark_awakening: DARK_AWAKENING,
    towards_the_light: TOWARDS_THE_LIGHT,
    light_empowered: LIGHT_EMPOWERED,
    cave_respite: CAVE_RESPITE,
    monster: MONSTER,
    core_awakening: CORE_AWAKENING,
    ember_threshold: EMBER_THRESHOLD,
    last_holdout: LAST_HOLDOUT,
};

export type { StorylineDef, StorylineFlowEdge } from './types';
export { getUnlockedMissionIds, isMissionCompleted } from './unlock';
