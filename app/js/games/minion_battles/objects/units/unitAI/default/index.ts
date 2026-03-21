/**
 * Default UnitAITree - Idle, Attack, SiegeDefendPoint, FindLight, Wander.
 */

import type { UnitAITree } from '../types';
import { default_idle } from './default_idle';
import { default_attack } from './default_attack';
import { default_siegeDefendPoint } from './default_siegeDefendPoint';
import { default_findLight } from './default_findLight';
import { default_wander } from './default_wander';

export type DefaultNodeId = 'default_idle' | 'default_attack' | 'default_siegeDefendPoint' | 'default_findLight' | 'default_wander';

export const DEFAULT_AI_TREE: UnitAITree<'default', DefaultNodeId> = {
    name: 'default',
    entryNodeId: 'default_idle',
    nodes: {
        default_idle,
        default_attack,
        default_siegeDefendPoint,
        default_findLight,
        default_wander,
    },
};
