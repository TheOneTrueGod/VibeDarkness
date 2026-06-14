import type { UnitAIContextBase } from '../contextBase';

export type SwarmlingNetworkNodeId = 'snet_seek' | 'snet_hunt';

export interface SwarmlingNetworkAITreeContext extends UnitAIContextBase {
    aiTree: 'swarmlingNetwork';
    aiState?: SwarmlingNetworkNodeId;
    /** Unit being hunted (hunt mode). */
    huntTargetId?: string;
    /** HP recorded last tick — drop signals a hit from an unseen attacker. */
    lastKnownHp?: number;
}
