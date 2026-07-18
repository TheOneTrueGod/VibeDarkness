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

            const grid = context.terrainManager?.grid;
            if (grid) {
                const needsNewPath =
                    unit.pathInvalidated ||
                    !unit.movement ||
                    unit.movement.path.length === 0 ||
                    unit.movement.targetUnitId !== target.id;

                if (needsNewPath) {
                    const from = grid.worldToGrid(unit.x, unit.y);
                    const to = grid.worldToGrid(target.x, target.y);
                    const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
                    if (path && path.length > 1) {
                        unit.setMovement(path.slice(1), target.id, context.gameTick);
                    } else {
                        unit.clearMovement();
                    }
                }
            }

            const allEnemies = findEnemies(unit, context.getUnits());
            const targetOnly = allEnemies.filter((e) => e.id === ctx.engageTargetId);
            if (tryQueueAbilityOrder(unit, context, targetOnly)) return;

            context.emitTurnEnd(unit.id);
        },

        onPathfindingRetrigger(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as NetworkHuntAITreeContext;
            const target = ctx.engageTargetId ? context.getUnit(ctx.engageTargetId) : null;
            if (!target?.isAlive()) return;
            const grid = context.terrainManager?.grid;
            if (!grid) return;
            const from = grid.worldToGrid(unit.x, unit.y);
            const to = grid.worldToGrid(target.x, target.y);
            const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
            if (path && path.length > 1) {
                unit.setMovement(path.slice(1), target.id, context.gameTick);
            }
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
