/**
 * default_attack - Move to ideal range and use best ability (by priority) on target.
 */

import type { Unit } from '../../../Unit';
import type { AIContext } from '../types';
import type { AINode } from '../types';
import { findEnemies, applyAIMovementToUnit, tryQueueAbilityOrder } from '../utils';
import { getPerceptionRange } from '../../../../engine/unitDef';

const TREE_NAME = 'default';
type DefaultNodeId = 'default_idle' | 'default_attack' | 'default_siegeDefendPoint' | 'default_findLight' | 'default_wander';

export const default_attack: AINode<typeof TREE_NAME, DefaultNodeId> = {
    nodeId: 'default_attack',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const targetId = unit.aiContext?.aiTargetUnitId;
            const target = targetId ? context.getUnit(targetId) : null;
            if (!target?.isAlive()) {
                unit.aiContext = { ...unit.aiContext, unitAINodeId: 'default_idle', aiTargetUnitId: undefined };
                context.emitTurnEnd(unit.id);
                return;
            }
            const enemies = findEnemies(unit, context.getUnits());
            const targetInEnemies = enemies.filter((e) => e.id === targetId);
            if (targetInEnemies.length === 0) {
                unit.aiContext = { ...unit.aiContext, unitAINodeId: 'default_idle', aiTargetUnitId: undefined };
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
            const targetId = unit.aiContext?.aiTargetUnitId;
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
            evaluate(unit: Unit, context: AIContext): boolean {
                const targetId = unit.aiContext?.aiTargetUnitId;
                const target = targetId ? context.getUnit(targetId) : null;
                return !target?.isAlive();
            },
        },
    ],
};
