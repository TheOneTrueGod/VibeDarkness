/**
 * Entry node: dispatches to scout travel or defend based on lanterniteRole.
 * Waits one tick then transitions via edges.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import { queueWaitAndEndTurn } from '../utils';
import type { LanterniteNetworkAITreeContext, LanterniteNetworkNodeId } from './context';

export const lnet_assign_role: AINode<'lanterniteNetwork', LanterniteNetworkNodeId> = {
    nodeId: 'lnet_assign_role',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as LanterniteNetworkAITreeContext;
            ctx.aiTree = 'lanterniteNetwork';
            ctx.aiState = 'lnet_assign_role';
            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [
        {
            targetNodeId: 'lnet_scout_travel',
            evaluate(unit: Unit): boolean {
                return unit.lanterniteState.role === 'scout' && unit.lanterniteState.patrolFarWorld != null;
            },
        },
        {
            targetNodeId: 'lnet_guard',
            evaluate(unit: Unit): boolean {
                return unit.lanterniteState.role === 'defender';
            },
        },
    ],
};
