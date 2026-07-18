import type { UnitAITree } from '../types';
import type { NetworkHuntNodeId } from './context';
import { nh_travel } from './nh_travel';
import { nh_engage } from './nh_engage';

export const NETWORK_HUNT_AI_TREE: UnitAITree<'networkHunt', NetworkHuntNodeId> = {
    name: 'networkHunt',
    entryNodeId: 'nh_travel',
    nodes: {
        nh_travel,
        nh_engage,
    },
};

export type { NetworkHuntAITreeContext, NetworkHuntNodeId } from './context';
