/**
 * Random story slot bag: pick from an explicit registry matching challengeRating / tags.
 * Missions opt in via `randomStoryPool` and must be listed in RANDOM_STORY_BAG.
 */

import type { IBaseMissionDef } from './BaseMissionDef';
import type { RandomStorySlotParams } from './questTypes';
import { FOUND_BERRIES } from './WorldOfDarkness/questMissions/found_berries';
import { SURFACE_METAL_DEPOSIT } from './WorldOfDarkness/questMissions/surface_metal_deposit';

export const RANDOM_STORY_GENERATOR_ID = 'random_story_v1';

/**
 * Explicit bag of story missions eligible for random_story slots.
 * Keep in sync when adding new random-story content.
 */
export const RANDOM_STORY_BAG: readonly IBaseMissionDef[] = [
    FOUND_BERRIES,
    SURFACE_METAL_DEPOSIT,
];

export function missionMatchesRandomStoryParams(
    mission: IBaseMissionDef,
    params: RandomStorySlotParams,
): boolean {
    if (!mission.randomStoryPool) return false;
    if (mission.challengeRating == null) return false;
    if (
        params.challengeRatingMin != null
        && mission.challengeRating < params.challengeRatingMin
    ) {
        return false;
    }
    if (
        params.challengeRatingMax != null
        && mission.challengeRating > params.challengeRatingMax
    ) {
        return false;
    }
    if (params.tags?.length) {
        const tags = mission.tags ?? [];
        if (!params.tags.every((t) => tags.includes(t))) return false;
    }
    return true;
}

/** Stable ordered candidates for deterministic pick. */
export function listRandomStoryCandidates(params: RandomStorySlotParams): IBaseMissionDef[] {
    return RANDOM_STORY_BAG
        .filter((m) => missionMatchesRandomStoryParams(m, params))
        .slice()
        .sort((a, b) => a.missionId.localeCompare(b.missionId));
}

/** Pick one candidate using slotSeed (must be non-empty). */
export function pickRandomStoryMission(
    params: RandomStorySlotParams,
    slotSeed: number,
): IBaseMissionDef {
    const candidates = listRandomStoryCandidates(params);
    if (candidates.length === 0) {
        throw new Error(
            `No random_story candidates for params ${JSON.stringify(params)}`,
        );
    }
    const index = Math.abs(slotSeed >>> 0) % candidates.length;
    return candidates[index]!;
}
