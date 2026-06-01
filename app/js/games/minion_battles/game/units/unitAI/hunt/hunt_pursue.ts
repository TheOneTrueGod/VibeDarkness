/**
 * hunt_pursue - Move toward and attack the current target.
 *
 * Periodically rescans for the nearest living enemy and switches targets so the
 * unit naturally pivots to a closer threat. Does not require line-of-sight to
 * keep a target — the unit pathfinds relentlessly. Returns to hunt_seek only
 * when the target is dead or has been removed.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { HuntAITreeContext, HuntNodeId } from './context';
import { findEnemies, applyAIMovementToUnit, tryQueueAbilityOrder, ROUND_DURATION } from '../utils';

/** How often (in rounds) the unit rescans for the nearest enemy. */
const RESCAN_INTERVAL_ROUNDS = 0.5;

export const hunt_pursue: AINode<'hunt', HuntNodeId> = {
    nodeId: 'hunt_pursue',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as HuntAITreeContext;

            const lastScan = ctx.lastScanTime ?? -Infinity;
            if (context.gameTime - lastScan >= RESCAN_INTERVAL_ROUNDS * ROUND_DURATION) {
                ctx.lastScanTime = context.gameTime;
                const enemies = findEnemies(unit, context.getUnits());
                if (enemies.length > 0) {
                    ctx.targetUnitId = enemies[0]!.id;
                } else {
                    ctx.targetUnitId = undefined;
                }
            }

            const target = ctx.targetUnitId ? context.getUnit(ctx.targetUnitId) : null;
            if (!target?.isAlive()) {
                ctx.aiState = 'hunt_seek';
                ctx.targetUnitId = undefined;
                return;
            }

            if (unit.aiSettings && context.terrainManager) {
                applyAIMovementToUnit(unit, target, {
                    findGridPath: (fc, fr, tc, tr) => context.findGridPathForUnit(unit, fc, fr, tc, tr),
                    worldToGrid: context.terrainManager.grid.worldToGrid.bind(context.terrainManager.grid),
                    gameTick: context.gameTick,
                    worldWidth: context.WORLD_WIDTH,
                    worldHeight: context.WORLD_HEIGHT,
                });
            }

            const enemies = findEnemies(unit, context.getUnits());
            const targetInEnemies = enemies.filter((e) => e.id === ctx.targetUnitId);
            if (tryQueueAbilityOrder(unit, context, targetInEnemies)) return;

            context.emitTurnEnd(unit.id);
        },

        onPathfindingRetrigger(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as HuntAITreeContext;
            const target = ctx.targetUnitId ? context.getUnit(ctx.targetUnitId) : null;
            if (!target?.isAlive() || !unit.aiSettings || !context.terrainManager) return;
            applyAIMovementToUnit(unit, target, {
                findGridPath: (fc, fr, tc, tr) => context.findGridPathForUnit(unit, fc, fr, tc, tr),
                worldToGrid: context.terrainManager.grid.worldToGrid.bind(context.terrainManager.grid),
                gameTick: context.gameTick,
                worldWidth: context.WORLD_WIDTH,
                worldHeight: context.WORLD_HEIGHT,
            });
        },
    },
    edges: [
        {
            targetNodeId: 'hunt_seek',
            evaluate(unit: Unit, context: AIContext): boolean {
                const ctx = unit.aiContext as HuntAITreeContext;
                const target = ctx.targetUnitId ? context.getUnit(ctx.targetUnitId) : null;
                return !target?.isAlive();
            },
        },
    ],
};
