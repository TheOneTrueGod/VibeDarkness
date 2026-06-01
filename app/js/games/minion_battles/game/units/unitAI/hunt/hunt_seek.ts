/**
 * hunt_seek - Find the nearest enemy and begin pursuit.
 *
 * Does not require line-of-sight; picks the closest living enemy by distance.
 * Transitions immediately to hunt_pursue once a target is found.
 * If no enemies are alive, waits.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { HuntAITreeContext, HuntNodeId } from './context';
import { findEnemies, queueWaitAndEndTurn } from '../utils';

export const hunt_seek: AINode<'hunt', HuntNodeId> = {
    nodeId: 'hunt_seek',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as HuntAITreeContext;
            const enemies = findEnemies(unit, context.getUnits());
            if (enemies.length > 0) {
                ctx.targetUnitId = enemies[0]!.id;
                ctx.aiState = 'hunt_pursue';
                return;
            }
            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [],
};
