/**
 * gardenNode_idle - Wait while no player is in sight; switch to attack when one appears. A node whose ability needs no
 * enemy (`aiSettings.castWithoutEnemies`: the Gloam Lily's Drink Light) still casts it here.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { GardenNodeId } from './context';
import { queueWaitAndEndTurn, tryQueueAbilityOrder } from '../utils';
import { getVisibleEnemiesNearestFirst } from '../displacer/displacerPerception';
import { isBurrowHopDue } from '../../components/burrowHop';

export const gardenNode_idle: AINode<'gardenNode', GardenNodeId> = {
    nodeId: 'gardenNode_idle',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            // Empty enemy pools: only abilities that need no enemy can be picked.
            if (!isBurrowHopDue(unit, context.gameTime) && tryQueueAbilityOrder(unit, context, [], [])) return;
            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [
        {
            targetNodeId: 'gardenNode_attack',
            evaluate(unit: Unit, context: AIContext): boolean {
                return getVisibleEnemiesNearestFirst(unit, context).length > 0;
            },
        },
    ],
};
