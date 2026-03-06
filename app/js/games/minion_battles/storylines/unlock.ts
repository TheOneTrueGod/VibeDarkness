/**
 * Compute unlocked and completed missions from campaign progress and storyline def.
 */

import type { StorylineDef } from './types';
import type { MissionResult } from '../../../types';

/** Mission is completed if it appears in campaign missionResults. */
export function isMissionCompleted(missionId: string, missionResults: MissionResult[]): boolean {
    return missionResults.some((r) => r.missionId === missionId);
}

/** Mission has a victory (non-defeat) result. */
export function hasVictoryResult(missionId: string, missionResults: MissionResult[]): boolean {
    return missionResults.some((r) => r.missionId === missionId && r.result !== 'defeat');
}

/**
 * Return set of mission IDs that are unlocked for this storyline given campaign missionResults.
 * Unlocked = start mission + any toMissionId where fromMissionId has a matching result.
 */
export function getUnlockedMissionIds(
    storyline: StorylineDef,
    missionResults: MissionResult[]
): Set<string> {
    const unlocked = new Set<string>();
    unlocked.add(storyline.startMissionId);

    const edges = storyline.edges ?? [];
    for (const edge of edges) {
        const fromResult = missionResults.find((r) => r.missionId === edge.fromMissionId && r.result === edge.result);
        if (fromResult) {
            unlocked.add(edge.toMissionId);
        }
    }

    return unlocked;
}
