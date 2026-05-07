import type { UnitAITree } from '../types';
import type { LanternitePatrolNodeId } from './context';
import { lantern_patrol } from './lantern_patrol';

export const LANTERNITE_PATROL_AI_TREE: UnitAITree<'lanternitePatrol', LanternitePatrolNodeId> = {
    name: 'lanternitePatrol',
    entryNodeId: 'lantern_patrol',
    nodes: { lantern_patrol },
};

export type { LanternitePatrolAITreeContext } from './context';
