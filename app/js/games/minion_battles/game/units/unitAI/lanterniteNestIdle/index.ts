/**
 * Passive nest — waits out its turn without moving.
 */

import type { Unit } from '../../Unit';
import type { AIContext, UnitAITree } from '../types';
import type { AINode } from '../types';
import { queueWaitAndEndTurn } from '../utils';

export type LanterniteNestIdleNodeId = 'nest_idle';

const nest_idle: AINode<'lanterniteNestIdle', LanterniteNestIdleNodeId> = {
    nodeId: 'nest_idle',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            (unit.aiContext as { aiTree?: string }).aiTree = 'lanterniteNestIdle';
            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [],
};

export const LANTERNITE_NEST_IDLE_TREE: UnitAITree<'lanterniteNestIdle', LanterniteNestIdleNodeId> = {
    name: 'lanterniteNestIdle',
    entryNodeId: 'nest_idle',
    nodes: { nest_idle },
};
