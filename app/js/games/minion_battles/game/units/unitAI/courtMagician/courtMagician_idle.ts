/**
 * courtMagician_idle - Wait while no player is in sight; switch to attack when one appears.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { CourtMagicianNodeId } from './context';
import { queueWaitAndEndTurn } from '../utils';
import { getVisibleEnemiesNearestFirst } from '../displacer/displacerPerception';

export const courtMagician_idle: AINode<'courtMagician', CourtMagicianNodeId> = {
    nodeId: 'courtMagician_idle',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [
        {
            targetNodeId: 'courtMagician_attack',
            evaluate(unit: Unit, context: AIContext): boolean {
                return getVisibleEnemiesNearestFirst(unit, context).length > 0;
            },
        },
    ],
};
