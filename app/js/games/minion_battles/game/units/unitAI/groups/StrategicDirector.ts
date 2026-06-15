/**
 * StrategicDirector — interface missions implement to bootstrap group structure.
 *
 * A director receives a flat list of AI unit IDs and returns a set of
 * GroupBlackboards describing the initial groups and their strategic plans.
 * GroupManager seeds these blackboards from the director during mission setup.
 *
 * Missions that need multiple groups, role differentiation, or custom advance
 * waypoints create their own director implementation. Missions that don't care
 * get DefaultStrategicDirector automatically (one group, hunt + opportunistic).
 */

import type { AIContext } from '../types';
import type { GroupBlackboard } from './types';
import { createPlan } from '../plans/planUtils';

/**
 * Interface missions implement to control group creation.
 * Called once when the mission starts (or when units are first registered).
 */
export interface StrategicDirector {
    /**
     * Given a list of AI-controlled unit IDs and the current AIContext,
     * return the initial set of GroupBlackboards for those units.
     */
    createGroups(unitIds: string[], context: AIContext): GroupBlackboard[];
}

/** Hold timer for the default strategic plan (in ticks). */
const DEFAULT_STRATEGIC_HOLD_TICKS = 100;

/**
 * Default director: places all provided units into a single group with a
 * "hunt + opportunistic" strategic plan. Used by any mission that does not
 * supply a custom director.
 */
export class DefaultStrategicDirector implements StrategicDirector {
    createGroups(unitIds: string[], context: AIContext): GroupBlackboard[] {
        if (unitIds.length === 0) return [];

        const groupId = 'default_group';
        const strategicPlan = createPlan(
            {
                type: 'hunt' as const,
                engagePolicy: 'opportunistic' as const,
                priority: 1,
            },
            {
                baseTicks: DEFAULT_STRATEGIC_HOLD_TICKS,
                moveJitter: 0,
                maxJitterTicks: 0,
                invalidateOn: new Set(),
                currentTick: context.gameTick,
            },
        );

        const blackboard: GroupBlackboard = {
            groupId,
            unitIds: [...unitIds],
            strategicPlan,
            nextBrainTick: 0, // run brain immediately on first tick
        };

        return [blackboard];
    }
}
