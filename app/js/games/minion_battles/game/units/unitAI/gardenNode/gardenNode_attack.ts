/**
 * gardenNode_attack - Cast the node's best eligible ability at the nearest visible player; a Bud (no living child,
 * a speed) also drifts to keep its range, held to its Stem's leash by the node tree. Knots, the Heart and the Mender
 * Bloom hold still. A node with no abilities (the Heart, the Hive Gourd) just waits: its work is its children.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { GardenNodeAITreeContext, GardenNodeId } from './context';
import { applyAIMovementToUnit, queueWaitAndEndTurn, tryQueueAbilityOrder } from '../utils';
import { getEnemiesInRangeNearestFirst, getVisibleEnemiesNearestFirst } from '../displacer/displacerPerception';
import { canNodeMove } from './gardenNodeRules';

export const gardenNode_attack: AINode<'gardenNode', GardenNodeId> = {
    nodeId: 'gardenNode_attack',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as GardenNodeAITreeContext;
            const inSight = getVisibleEnemiesNearestFirst(unit, context);
            const nearby = getEnemiesInRangeNearestFirst(unit, context);
            const target = inSight[0] ?? nearby[0];
            if (!target) {
                ctx.aiState = 'gardenNode_idle';
                return;
            }
            ctx.targetUnitId = target.id;
            if (canNodeMove(unit)) applyAIMovementToUnit(unit, nearby[0] ?? target, context);
            if (inSight.length > 0 && tryQueueAbilityOrder(unit, context, inSight, nearby)) return;
            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [
        {
            targetNodeId: 'gardenNode_idle',
            evaluate(unit: Unit, context: AIContext): boolean {
                return getEnemiesInRangeNearestFirst(unit, context).length === 0;
            },
        },
    ],
};
