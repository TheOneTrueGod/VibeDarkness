/**
 * Compute unlocked and completed missions from campaign progress and storyline def.
 */

import type { StorylineDef } from './types';
import type { MissionResult } from '../../../types';

/** One entry per mission id — keeps the newest by optional timestamp (handles legacy duplicate rows). */
export function latestMissionResultsOnly(missionResults: MissionResult[]): MissionResult[] {
    const map = new Map<string, MissionResult>();
    for (const r of missionResults) {
        const existing = map.get(r.missionId);
        if (!existing) {
            map.set(r.missionId, r);
            continue;
        }
        const existingTs = (existing as { timestamp?: number }).timestamp ?? 0;
        const nextTs = (r as { timestamp?: number }).timestamp ?? 0;
        if (nextTs >= existingTs) {
            map.set(r.missionId, r);
        }
    }
    return [...map.values()];
}

/** Mission is completed if it appears in campaign missionResults. */
export function isMissionCompleted(missionId: string, missionResults: MissionResult[]): boolean {
    return latestMissionResultsOnly(missionResults).some((r) => r.missionId === missionId);
}

/** Mission has a victory (non-defeat) result. */
export function hasVictoryResult(missionId: string, missionResults: MissionResult[]): boolean {
    return latestMissionResultsOnly(missionResults).some((r) => r.missionId === missionId && r.result !== 'defeat');
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

    const latest = latestMissionResultsOnly(missionResults);
    const edges = storyline.edges ?? [];
    for (const edge of edges) {
        const fromResult = latest.find((r) => r.missionId === edge.fromMissionId && r.result === edge.result);
        if (fromResult) {
            unlocked.add(edge.toMissionId);
        }
    }

    // `cave_respite` was inserted after `light_empowered`; keep `monster` unlocked for campaigns that
    // already had an Alpha Wolf victory, and allow the optional story mission for backfill.
    if (storyline.id === 'world_of_darkness' && hasVictoryResult('monster', missionResults)) {
        unlocked.add('monster');
        unlocked.add('cave_respite');
    }

    return unlocked;
}

/**
 * Return all mission IDs for this storyline in display order (start first, then each edge's toMissionId).
 * Use this to show every mission in the storyline; pair with getUnlockedMissionIds to show locked state.
 */
export function getAllMissionIdsInOrder(storyline: StorylineDef): string[] {
    const ids: string[] = [storyline.startMissionId];
    const edges = storyline.edges ?? [];
    for (const edge of edges) {
        if (!ids.includes(edge.toMissionId)) {
            ids.push(edge.toMissionId);
        }
    }
    return ids;
}
