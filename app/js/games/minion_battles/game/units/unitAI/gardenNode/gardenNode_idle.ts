/**
 * gardenNode_idle - Wait while no player is in sight; switch to attack when one appears.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { GardenNodeId } from './context';
import { queueWaitAndEndTurn } from '../utils';
import { getVisibleEnemiesNearestFirst } from '../displacer/displacerPerception';

export const gardenNode_idle: AINode<'gardenNode', GardenNodeId> = {
    nodeId: 'gardenNode_idle',
    actions: {
        execute(unit: Unit, context: AIContext): void {
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
