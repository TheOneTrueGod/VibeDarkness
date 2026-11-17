/**
 * gardenNode_attack - Cast the node's best eligible ability at the nearest visible player. Nodes never walk: a node
 * that moves does it by burrowing (`burrowHop` component), so while a hop is due it holds its casts and waits for the
 * hop. A node with no abilities (the Heart, the Hive Gourd) just waits: its work is its children.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { GardenNodeAITreeContext, GardenNodeId } from './context';
import { queueWaitAndEndTurn, tryQueueAbilityOrder } from '../utils';
import { getEnemiesInRangeNearestFirst, getVisibleEnemiesNearestFirst } from '../displacer/displacerPerception';
import { isBurrowHopDue } from '../../components/burrowHop';

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
            if (!isBurrowHopDue(unit, context.gameTime) && inSight.length > 0 && tryQueueAbilityOrder(unit, context, inSight, nearby)) return;
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
