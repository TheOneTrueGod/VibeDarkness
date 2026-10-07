/**
 * displacerBoss_idle - Wait while no player is in sight; switch to attack when one appears.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { DisplacerBossAITreeContext, DisplacerBossNodeId } from './context';
import { queueWaitAndEndTurn } from '../utils';
import { getVisibleEnemiesNearestFirst } from '../displacer/displacerPerception';

function sight(unit: Unit): number | undefined {
    return (unit.aiContext as DisplacerBossAITreeContext).sightRadius;
}

export const displacerBoss_idle: AINode<'displacerBoss', DisplacerBossNodeId> = {
    nodeId: 'displacerBoss_idle',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [
        {
            targetNodeId: 'displacerBoss_attack',
            evaluate(unit: Unit, context: AIContext): boolean {
                return getVisibleEnemiesNearestFirst(unit, context, sight(unit)).length > 0;
            },
        },
    ],
};
