import type { UnitAITree } from '../types';
import type { LanterniteNetworkNodeId } from './context';
import { lnet_assign_role } from './lnet_assign_role';
import { lnet_scout_travel } from './lnet_scout_travel';
import { lnet_scout_construct } from './lnet_scout_construct';
import { lnet_defend } from './lnet_defend';

export const LANTERNITE_NETWORK_AI_TREE: UnitAITree<'lanterniteNetwork', LanterniteNetworkNodeId> = {
    name: 'lanterniteNetwork',
    entryNodeId: 'lnet_assign_role',
    nodes: {
        lnet_assign_role,
        lnet_scout_travel,
        lnet_scout_construct,
        lnet_defend,
    },
};

export type { LanterniteNetworkAITreeContext, LanterniteNetworkNodeId } from './context';
