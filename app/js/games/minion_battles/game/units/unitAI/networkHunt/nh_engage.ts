/**
 * Engage mode: chase and attack the enemy spotted during nh_travel's perception scan. Returns to
 * nh_travel (network march toward the nearest structure) once the target dies.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import { findEnemies, tryQueueAbilityOrder, queueWaitAndEndTurn } from '../utils';
import type { NetworkHuntAITreeContext, NetworkHuntNodeId } from './context';

export const nh_engage: AINode<'networkHunt', NetworkHuntNodeId> = {
    nodeId: 'nh_engage',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as NetworkHuntAITreeContext;
            ctx.aiTree = 'networkHunt';
            ctx.aiState = 'nh_engage';

            const target = ctx.engageTargetId ? context.getUnit(ctx.engageTargetId) : null;

            if (!target?.isAlive()) {
                ctx.aiState = 'nh_travel';
                ctx.engageTargetId = undefined;
                ctx.lastKnownHp = undefined;
                queueWaitAndEndTurn(unit, context);
                return;
            }

            context.nav.chaseUnit(unit, target);

            const allEnemies = findEnemies(unit, context.getUnits());
            const targetOnly = allEnemies.filter((e) => e.id === ctx.engageTargetId);
            if (tryQueueAbilityOrder(unit, context, targetOnly)) return;

            context.emitTurnEnd(unit.id);
        },
    },
    edges: [
        {
            targetNodeId: 'nh_travel',
            evaluate(unit: Unit): boolean {
                const ctx = unit.aiContext as NetworkHuntAITreeContext;
                return ctx.aiState === 'nh_travel';
            },
        },
    ],
};
