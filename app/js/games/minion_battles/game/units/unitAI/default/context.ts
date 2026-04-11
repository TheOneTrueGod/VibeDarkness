/**
 * Default tree AI context. Covers idle, attack, siegeDefendPoint, findLight, wander nodes.
 */

import type { UnitAIContextBase } from '../contextBase';

export type DefaultNodeId =
    | 'default_idle'
    | 'default_attack'
    | 'default_siegeDefendPoint'
    | 'default_findLight'
    | 'default_wander';

export interface DefaultAITreeContext extends UnitAIContextBase {
    aiTree: 'default';
    aiState?: DefaultNodeId;
    /** siegeDefendPoint: ID of the DefendPoint this unit is moving toward. */
    defensePointTargetId?: string;
    /** siegeDefendPoint: tile ID being corrupted. */
    corruptingTargetId?: string;
    /** siegeDefendPoint: gameTime when corruption started. */
    corruptingStartedAt?: number;
    /** findLight: light source ID we are moving toward. */
    findLightSourceId?: string;
    /** findLight: gameTime when we finish idling at light. */
    findLightIdleUntil?: number;
}
