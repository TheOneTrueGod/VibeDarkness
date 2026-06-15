import type { Plan, StrategicPlan } from '../plans/types';

/**
 * Per-group shared data. Includes a cached strategic plan plus ephemeral outputs
 * written by the group brain each time it runs. Ephemeral fields are not serialized —
 * the group brain repopulates them on its first run after deserialization.
 */
export interface GroupBlackboard {
    groupId: string;
    unitIds: string[];
    strategicPlan: Plan<StrategicPlan>;
    // Ephemeral outputs written by group brain (not serialized):
    formationCenter?: { x: number; y: number };
    advanceWaypoint?: { col: number; row: number };
    sharedTargetId?: string;
    nextBrainTick: number;
}

/**
 * Stable hash of a groupId string reduced to [0, 1). Same semantic role as
 * `unit.moveJitter` but for groups. Sum char codes, modulo a prime, divide by prime.
 */
export function groupJitter(groupId: string): number {
    const PRIME = 1000003;
    let sum = 0;
    for (let i = 0; i < groupId.length; i++) {
        sum = (sum + groupId.charCodeAt(i)) % PRIME;
    }
    return sum / PRIME;
}

/** JSON-safe representation of a group. Uses relative tick counts instead of absolute. */
export interface SerializedGroup {
    groupId: string;
    unitIds: string[];
    strategicPlan: {
        type: string;
        destinationPOIId?: string;
        destinationLabel?: string;
        engagePolicy: string;
        priority: number;
        ticksRemaining: number; // relative
    };
    brainTicksRemaining: number; // relative
}
