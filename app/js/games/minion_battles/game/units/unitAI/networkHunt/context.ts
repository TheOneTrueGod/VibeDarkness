import type { UnitAIContextBase } from '../contextBase';

export type NetworkHuntNodeId = 'nh_travel' | 'nh_engage';

export interface NetworkHuntAITreeContext extends UnitAIContextBase {
    aiTree: 'networkHunt';
    aiState?: NetworkHuntNodeId;
    /** Unit currently being engaged (nh_engage mode). */
    engageTargetId?: string;
    /** HP recorded last tick — a drop signals a hit from an unseen attacker. */
    lastKnownHp?: number;
    /** Network node id this unit currently considers itself "at" (updated each nh_travel tick). */
    currentNodeId?: string;
    /** Network node id of the enemy structure currently being marched toward. */
    targetStructureNodeId?: string;
}
