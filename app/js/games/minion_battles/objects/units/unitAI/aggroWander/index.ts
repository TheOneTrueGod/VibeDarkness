/**
 * AggroWander UnitAITree - Wander near spawn, attack on sight, return when target lost.
 */

import type { UnitAITree } from '../types';
import { aggroWander_wander } from './aggroWander_wander';
import { aggroWander_attack } from './aggroWander_attack';

export type AggroWanderNodeId = 'aggroWander_wander' | 'aggroWander_attack';

export const AGGRO_WANDER_AI_TREE: UnitAITree<'aggroWander', AggroWanderNodeId> = {
    name: 'aggroWander',
    entryNodeId: 'aggroWander_wander',
    nodes: {
        aggroWander_wander,
        aggroWander_attack,
    },
};
