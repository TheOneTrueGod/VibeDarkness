/**
 * Defender chase: pursue and attack the threat until it dies, then return to guard.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import { findEnemies, tryQueueAbilityOrder, queueWaitAndEndTurn } from '../utils';
import type { LanterniteNetworkAITreeContext, LanterniteNetworkNodeId } from './context';

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
                    if (path && path.length > 0) {
                        unit.setMovement(path, target.id, context.gameTick);
                    } else {
                        unit.clearMovement();
                    }
                }
            }

            // Attack if in range
            const allEnemies = findEnemies(unit, context.getUnits());
            const targetOnly = allEnemies.filter((e) => e.id === ctx.chaseTargetId);
            if (tryQueueAbilityOrder(unit, context, targetOnly)) return;

            context.emitTurnEnd(unit.id);
        },

        onPathfindingRetrigger(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as LanterniteNetworkAITreeContext;
            const target = ctx.chaseTargetId ? context.getUnit(ctx.chaseTargetId) : null;
            if (!target?.isAlive()) return;
            const grid = context.terrainManager?.grid;
            if (!grid) return;
            const from = grid.worldToGrid(unit.x, unit.y);
            const to = grid.worldToGrid(target.x, target.y);
            const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
            if (path && path.length > 0) {
                unit.setMovement(path, target.id, context.gameTick);
            }
        },
    },
    edges: [
        {
            targetNodeId: 'lnet_guard',
            evaluate(unit: Unit): boolean {
                const ctx = unit.aiContext as LanterniteNetworkAITreeContext;
                return ctx.aiState === 'lnet_guard';
            },
        },
    ],
};
