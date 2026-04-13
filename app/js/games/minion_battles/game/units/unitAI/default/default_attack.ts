/**
 * default_attack - Move to ideal range and use best ability (by priority) on target.
 */

import type { Unit } from '../../Unit';
import type { AIContext } from '../types';
import type { AINode } from '../types';
import type { DefaultAITreeContext, DefaultNodeId } from './context';
import { findEnemies, applyAIMovementToUnit, tryQueueAbilityOrder } from '../utils';

export const default_attack: AINode<'default', DefaultNodeId> = {
    nodeId: 'default_attack',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as DefaultAITreeContext;
            const targetId = ctx.targetUnitId;
            const target = targetId ? context.getUnit(targetId) : null;
            if (!target?.isAlive()) {
                ctx.aiState = 'default_idle';
                ctx.targetUnitId = undefined;
                context.emitTurnEnd(unit.id);
                return;
            }
            const enemies = findEnemies(unit, context.getUnits());
            const targetInEnemies = enemies.filter((e) => e.id === targetId);
            if (targetInEnemies.length === 0) {
                ctx.aiState = 'default_idle';
                ctx.targetUnitId = undefined;
                context.emitTurnEnd(unit.id);
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
            if (tryQueueAbilityOrder(unit, context, targetInEnemies)) return;
            context.emitTurnEnd(unit.id);
        },
        onPathfindingRetrigger(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as DefaultAITreeContext;
            const targetId = ctx.targetUnitId;
            const target = targetId ? context.getUnit(targetId) : null;
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
            targetNodeId: 'default_idle',
            evaluate(unit: Unit, _context: AIContext): boolean {
                const ctx = unit.aiContext as DefaultAITreeContext;
                const targetId = ctx.targetUnitId;
                const target = targetId ? _context.getUnit(targetId) : null;
                return !target?.isAlive();
            },
        },
    ],
};
