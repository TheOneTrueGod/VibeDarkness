import type { UnitAITree } from '../types';
import type { SwarmlingNetworkNodeId } from './context';
import { snet_seek } from './snet_seek';
import { snet_hunt } from './snet_hunt';

export const SWARMLING_NETWORK_AI_TREE: UnitAITree<'swarmlingNetwork', SwarmlingNetworkNodeId> = {
    name: 'swarmlingNetwork',
    entryNodeId: 'snet_seek',
    nodes: {
        snet_seek,
        snet_hunt,
    },
};

export type { SwarmlingNetworkAITreeContext, SwarmlingNetworkNodeId } from './context';
