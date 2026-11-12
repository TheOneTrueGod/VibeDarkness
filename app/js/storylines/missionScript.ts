/**
 * Shape of a mission's player-facing copy. Chapter scripts in this folder are the
 * place to edit that copy; mission classes import a slice and keep terrain, spawns,
 * and choice resolution.
 */

import type { PreMissionStoryDef, PostMissionStoryDef } from '../games/minion_battles/storylines/storyTypes';

export interface MissionScript {
    name: string;
    description: string;
    /** Objective id -> label, in the order the mission reveals them. */
    objectives?: Record<string, string>;
    /** Label on a player-control prompt (for example, possessing the boss). */
    playerControlLabel?: string;
    preMissionStory?: PreMissionStoryDef;
    postMissionStory?: PostMissionStoryDef;
}

/** Heading and flavor line for one story choice row. The mission supplies the action. */
export interface StoryChoiceCopy {
    label: string;
    loreTitle: string;
    loreDescription: string;
}
