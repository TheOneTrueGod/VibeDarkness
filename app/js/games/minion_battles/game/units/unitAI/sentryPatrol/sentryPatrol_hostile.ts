/**
 * sentryPatrol_hostile - Once woken, relentlessly chase and attack the nearest enemy.
 *
 * Keeps its target until it dies, retargeting to the nearest enemy every half round. No line of
 * sight needed: a woken sentry never goes back to sleep.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import {
    applyAIMovementToUnit,
    distance,
    findEnemies,
    queueWaitAndEndTurn,
    ROUND_DURATION,
    tryQueueAbilityOrder,
} from '../utils';
import type { SentryPatrolAITreeContext, SentryPatrolNodeId } from './context';

/** How often (in rounds) a hostile sentry switches to the nearest enemy. */
const RETARGET_INTERVAL_ROUNDS = 0.5;

export const sentryPatrol_hostile: AINode<'sentryPatrol', SentryPatrolNodeId> = {
    nodeId: 'sentryPatrol_hostile',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as SentryPatrolAITreeContext;
            const enemies = findEnemies(unit, context.getUnits());
            if (enemies.length === 0) {
                ctx.targetUnitId = undefined;
                queueWaitAndEndTurn(unit, context);
                return;
            }

            let target = ctx.targetUnitId ? enemies.find((e) => e.id === ctx.targetUnitId) : undefined;
            const lastScan = ctx.lastScanTime ?? -Infinity;
            if (!target || context.gameTime - lastScan >= RETARGET_INTERVAL_ROUNDS * ROUND_DURATION) {
                ctx.lastScanTime = context.gameTime;
                target = enemies.reduce((best, e) =>
                    distance(unit.x, unit.y, e.x, e.y) < distance(unit.x, unit.y, best.x, best.y) ? e : best,
                );
                ctx.targetUnitId = target.id;
            }

            applyAIMovementToUnit(unit, target, context);
            if (tryQueueAbilityOrder(unit, context, [target], enemies)) return;
            context.emitTurnEnd(unit.id);
        },
    },
    edges: [],
};
