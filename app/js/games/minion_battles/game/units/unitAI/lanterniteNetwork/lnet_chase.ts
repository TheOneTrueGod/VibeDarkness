/**
 * Defender chase: pursue and attack the threat until it dies, then return to guard — or switch
 * to lnet_scout_travel if the nest promotes this defender to scout mid-chase.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import { findEnemies, tryQueueAbilityOrder, queueWaitAndEndTurn } from '../utils';
import type { LanterniteNetworkAITreeContext, LanterniteNetworkNodeId } from './context';
import { lanterniteStateOf } from '../../components/lanterniteComponent';

export const lnet_chase: AINode<'lanterniteNetwork', LanterniteNetworkNodeId> = {
    nodeId: 'lnet_chase',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as LanterniteNetworkAITreeContext;
            ctx.aiTree = 'lanterniteNetwork';
            ctx.aiState = 'lnet_chase';

            const target = ctx.chaseTargetId ? context.getUnit(ctx.chaseTargetId) : null;

            if (!target?.isAlive()) {
                ctx.aiState = 'lnet_guard';
                ctx.chaseTargetId = undefined;
                ctx.lastKnownHp = undefined;
                queueWaitAndEndTurn(unit, context);
                return;
            }

            // Pathfind directly to the target (no range stopping — close to attack)
            context.nav.chaseUnit(unit, target);

            // Attack if in range
            const allEnemies = findEnemies(unit, context.getUnits());
            const targetOnly = allEnemies.filter((e) => e.id === ctx.chaseTargetId);
            if (tryQueueAbilityOrder(unit, context, targetOnly)) return;

            context.emitTurnEnd(unit.id);
        },
    },
    edges: [
        {
            // Promoted to scout by its nest (see processLanterniteNests's defender promotion).
            targetNodeId: 'lnet_scout_travel',
            evaluate(unit: Unit): boolean {
                return lanterniteStateOf(unit).role === 'scout' && lanterniteStateOf(unit).patrolFarWorld != null;
            },
        },
        {
            targetNodeId: 'lnet_guard',
            evaluate(unit: Unit): boolean {
                const ctx = unit.aiContext as LanterniteNetworkAITreeContext;
                return ctx.aiState === 'lnet_guard';
            },
        },
    ],
};
