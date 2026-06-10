import type { UnitAIContextBase } from '../contextBase';

export type LanterniteNetworkNodeId =
    | 'lnet_assign_role'
    | 'lnet_scout_travel'
    | 'lnet_scout_construct'
    | 'lnet_guard'
    | 'lnet_chase';

export interface LanterniteNetworkAITreeContext extends UnitAIContextBase {
    aiTree: 'lanterniteNetwork';
    aiState?: LanterniteNetworkNodeId;
    /** World-space patrol destination (guard mode). */
    patrolTargetX?: number;
    patrolTargetY?: number;
    /** gameTime when the unit arrived at the patrol point and started dwelling. */
    dwellStartTime?: number;
    /** HP recorded last tick — drop signals a hit. */
    lastKnownHp?: number;
    /** Unit being chased (chase mode). */
    chaseTargetId?: string;
}
