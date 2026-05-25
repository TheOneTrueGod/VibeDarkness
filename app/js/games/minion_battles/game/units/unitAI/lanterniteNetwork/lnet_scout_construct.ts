/**
 * Scout construction: stand still and wait for construction timer to elapse.
 * Opportunistically attacks enemies while waiting.
 * Construction completion is processed externally by lanterniteNestTick.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import {
    findEnemies,
    getEnemiesInPerceptionAndLOS,
    tryQueueAbilityOrder,
    queueWaitAndEndTurn,
} from '../utils';
import { getPerceptionRange } from '../../unit_defs/unitDef';
import type { LanterniteNetworkAITreeContext, LanterniteNetworkNodeId } from './context';

const ROUND_DURATION_SEC = 10;

export const lnet_scout_construct: AINode<'lanterniteNetwork', LanterniteNetworkNodeId> = {
    nodeId: 'lnet_scout_construct',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as LanterniteNetworkAITreeContext;
            ctx.aiTree = 'lanterniteNetwork';
            ctx.aiState = 'lnet_scout_construct';

            // Opportunistic attack while standing still
            if (context.gameTime >= unit.lanterniteAttackReadyAtGameTime) {
                const enemies = findEnemies(unit, context.getUnits());
                const perceptionRange = getPerceptionRange(unit.characterId);
                const inSight = getEnemiesInPerceptionAndLOS(
                    unit,
                    enemies,
                    perceptionRange,
                    context.hasLineOfSight,
                );
                if (tryQueueAbilityOrder(unit, context, inSight)) {
                    unit.lanterniteAttackReadyAtGameTime = context.gameTime + ROUND_DURATION_SEC;
                    return;
                }
            }

            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [],
};
