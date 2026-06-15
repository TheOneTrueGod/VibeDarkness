/**
 * hunt_seek - Find the nearest enemy and begin pursuit.
 *
 * First checks the unit's tactical plan: if there is already an active
 * chase_target plan pointing to a living enemy, reuses that target directly
 * without scanning. Otherwise scans for the nearest living enemy, writes a new
 * tactical plan, and transitions to hunt_pursue. Waits if no enemies exist.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { HuntAITreeContext, HuntNodeId } from './context';
import { findEnemies, queueWaitAndEndTurn } from '../utils';
import { createPlan, shouldReplan } from '../plans/planUtils';

/** Base ticks to hold a chase_target plan before reconsidering the target. */
const CHASE_PLAN_BASE_TICKS = 15;
/** Extra jitter ticks added proportionally to unit.moveJitter. */
const CHASE_PLAN_JITTER_TICKS = 10;

const CHASE_INVALIDATE_ON = new Set(['target_died', 'took_significant_damage'] as const);

export const hunt_seek: AINode<'hunt', HuntNodeId> = {
    nodeId: 'hunt_seek',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as HuntAITreeContext;

            // Reuse an existing valid chase_target plan if the target is still alive.
            const plan = unit.tacticalPlan;
            if (
                plan !== null &&
                plan.data.type === 'chase_target' &&
                plan.data.targetUnitId != null &&
                !shouldReplan(plan, context.gameTick, unit.pendingInterrupts)
            ) {
                const existingTarget = context.getUnit(plan.data.targetUnitId);
                if (existingTarget?.isAlive()) {
                    ctx.targetUnitId = plan.data.targetUnitId;
                    ctx.aiState = 'hunt_pursue';
                    return;
                }
            }

            // No valid plan — scan for the nearest enemy and create one.
            const enemies = findEnemies(unit, context.getUnits());
            if (enemies.length > 0) {
                const targetId = enemies[0]!.id;
                ctx.targetUnitId = targetId;
                ctx.aiState = 'hunt_pursue';
                unit.tacticalPlan = createPlan(
                    { type: 'chase_target', targetUnitId: targetId },
                    {
                        baseTicks: CHASE_PLAN_BASE_TICKS,
                        moveJitter: unit.moveJitter,
                        maxJitterTicks: CHASE_PLAN_JITTER_TICKS,
                        invalidateOn: CHASE_INVALIDATE_ON,
                        currentTick: context.gameTick,
                    },
                );
                return;
            }
            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [],
};
