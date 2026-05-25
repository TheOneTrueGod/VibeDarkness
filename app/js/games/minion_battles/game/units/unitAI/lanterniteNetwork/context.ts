import type { UnitAIContextBase } from '../contextBase';

export type LanterniteNetworkNodeId =
    | 'lnet_assign_role'
    | 'lnet_scout_travel'
    | 'lnet_scout_construct'
    | 'lnet_defend';

export interface LanterniteNetworkAITreeContext extends UnitAIContextBase {
    aiTree: 'lanterniteNetwork';
    aiState?: LanterniteNetworkNodeId;
}
