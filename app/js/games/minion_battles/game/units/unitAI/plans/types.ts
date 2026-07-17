export type InterruptFlag =
    | 'target_died'
    | 'terrain_changed_near_path'
    | 'path_blocked'
    | 'took_significant_damage'
    | 'enemy_entered_proximity'
    | 'group_dispersed'
    | 'objective_complete'
    | 'objective_invalidated';

export interface Plan<T> {
    data: T;
    holdUntilTick: number;
    invalidateOn: ReadonlySet<InterruptFlag>;
    pathWaypoints?: { col: number; row: number }[];
}

export interface StrategicPlan {
    type: 'advance' | 'defend' | 'construct' | 'hunt' | 'idle';
    destinationPOIId?: string;
    destinationLabel?: string;
    engagePolicy: 'opportunistic' | 'aggressive' | 'ignore' | 'flee';
    priority: number;
}

export interface TacticalPlan {
    type: 'move_to_waypoint' | 'hold_position' | 'chase_target' | 'return_to_group' | 'idle';
    waypointGrid?: { col: number; row: number };
    targetUnitId?: string;
    groupCohesionCenter?: { x: number; y: number };
}

/**
 * Immediate per-tick decision produced by the AI. Never serialized — ephemeral within one tick.
 */
export interface ImmediateDecision {
    type: 'use_ability' | 'move_along_path' | 'wait';
    abilityId?: string;
    targetId?: string;
    path?: { col: number; row: number }[];
}

/** JSON-safe representation of a tactical plan. Uses relative tick count instead of absolute. */
export interface SerializedTacticalPlan {
    type: TacticalPlan['type'];
    waypointGrid?: { col: number; row: number };
    targetUnitId?: string;
    groupCohesionCenter?: { x: number; y: number };
    ticksRemaining: number;
}
