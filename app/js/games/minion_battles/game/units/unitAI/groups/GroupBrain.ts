/**
 * GroupBrain — runs once per group per ~20 ticks.
 *
 * Reads the group's StrategicPlan and the current world state (via AIContext),
 * then writes ephemeral outputs onto the GroupBlackboard:
 *   - formationCenter  — average world position of living group members
 *   - sharedTargetId   — nearest living enemy to formationCenter (no LOS required)
 *   - advanceWaypoint  — grid destination derived from strategicPlan.destinationPOIId
 *
 * After writing outputs the brain reschedules itself using groupJitter so groups
 * don't all replan on the same tick.
 */

import type { AIContext } from '../types';
import type { GroupBlackboard } from './types';
import { groupJitter } from './types';
import { findEnemies, distance } from '../utils';

/** Base interval between group-brain runs (in ticks). */
export const GROUP_BRAIN_BASE_TICKS = 20;

/** Maximum additional jitter applied to group-brain scheduling (in ticks). */
export const GROUP_BRAIN_JITTER_TICKS = 10;

/**
 * Run the group brain for one blackboard.
 * Mutates the ephemeral fields of `blackboard` and reschedules `nextBrainTick`.
 */
export function runGroupBrain(blackboard: GroupBlackboard, context: AIContext): void {
    const livingMembers = blackboard.unitIds
        .map((id) => context.getUnit(id))
        .filter((u): u is NonNullable<typeof u> => u != null && u.isAlive());

    // --- formationCenter ---
    if (livingMembers.length > 0) {
        let sumX = 0;
        let sumY = 0;
        for (const u of livingMembers) {
            sumX += u.x;
            sumY += u.y;
        }
        blackboard.formationCenter = {
            x: sumX / livingMembers.length,
            y: sumY / livingMembers.length,
        };
    } else {
        blackboard.formationCenter = undefined;
    }

    // --- sharedTargetId ---
    // Use a representative member for findEnemies (team lookup); fall back to first member.
    // If no living members, clear shared target.
    if (livingMembers.length > 0 && blackboard.formationCenter) {
        const representative = livingMembers[0]!;
        const enemies = findEnemies(representative, context.getUnits());
        if (enemies.length > 0) {
            const center = blackboard.formationCenter;
            let nearest = enemies[0]!;
            let nearestDist = distance(center.x, center.y, nearest.x, nearest.y);
            for (let i = 1; i < enemies.length; i++) {
                const e = enemies[i]!;
                const d = distance(center.x, center.y, e.x, e.y);
                if (d < nearestDist) {
                    nearestDist = d;
                    nearest = e;
                }
            }
            blackboard.sharedTargetId = nearest.id;
        } else {
            blackboard.sharedTargetId = undefined;
        }
    } else {
        blackboard.sharedTargetId = undefined;
    }

    // --- advanceWaypoint ---
    const sp = blackboard.strategicPlan.data;
    if (sp.destinationPOIId && context.mapPOIs) {
        const poi = context.mapPOIs.find((p) => p.id === sp.destinationPOIId);
        if (poi) {
            blackboard.advanceWaypoint = { col: poi.col, row: poi.row };
        } else {
            blackboard.advanceWaypoint = undefined;
        }
    } else {
        // destinationLabel without a POI lookup is deferred (future work)
        blackboard.advanceWaypoint = undefined;
    }

    // --- Reschedule ---
    blackboard.nextBrainTick =
        context.gameTick +
        GROUP_BRAIN_BASE_TICKS +
        Math.floor(groupJitter(blackboard.groupId) * GROUP_BRAIN_JITTER_TICKS);
}
