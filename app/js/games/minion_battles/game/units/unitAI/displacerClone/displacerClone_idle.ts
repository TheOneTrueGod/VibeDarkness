/**
 * displacerClone_idle - Wait while no player is in sight. Clones vanish here if the
 * Displacer Spirit is gone (see despawnIfOrphaned).
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { DisplacerCloneAITreeContext, DisplacerCloneNodeId } from './context';
import { queueWaitAndEndTurn } from '../utils';
import { getVisibleEnemiesNearestFirst } from '../displacer/displacerPerception';
import { despawnIfOrphaned } from '../displacer/despawnIfOrphaned';

export const displacerClone_idle: AINode<'displacerClone', DisplacerCloneNodeId> = {
    nodeId: 'displacerClone_idle',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            if (despawnIfOrphaned(unit, context)) return;
            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [
        {
            targetNodeId: 'displacerClone_attack',
            evaluate(unit: Unit, context: AIContext): boolean {
                return (
                    getVisibleEnemiesNearestFirst(
                        unit,
                        context,
                        (unit.aiContext as DisplacerCloneAITreeContext).sightRadius,
                    ).length > 0
                );
            },
        },
    ],
};
