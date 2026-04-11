/**
 * default_siegeDefendPoint - Move to defend point, corrupt when close; engage hostiles.
 */

import type { Unit } from '../../../Unit';
import type { AIContext } from '../types';
import type { AINode } from '../types';
import type { DefaultAITreeContext, DefaultNodeId } from './context';
import {
    findEnemies,
    getDefendPointFromContext,
    getOrPickClosestDefendPoint,
    getEnemiesInPerceptionAndLOS,
    applyAIMovementToUnit,
    tryQueueAbilityOrder,
    queueWaitAndEndTurn,
} from '../utils';
import { getPerceptionRange } from '../../../../game/units/unit_defs/unitDef';

const TREE_NAME = 'default';

const DEFAULT_PATH_RETRIGGER = 50;

export const default_siegeDefendPoint: AINode<typeof TREE_NAME, DefaultNodeId> = {
    nodeId: 'default_siegeDefendPoint',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as DefaultAITreeContext;
            const defendPoints = context.getAliveDefendPoints();
            const terrainManager = context.terrainManager;
            const grid = terrainManager?.grid ?? null;

            if (defendPoints.length === 0) {
                unit.clearMovement();
                ctx.defensePointTargetId = undefined;
                ctx.targetUnitId = undefined;
                ctx.aiState = 'default_idle';
                context.emitTurnEnd(unit.id);
                return;
            }

            const currentDefendPoint = getDefendPointFromContext(unit, defendPoints);
            if (!currentDefendPoint) {
                const picked = getOrPickClosestDefendPoint(unit, defendPoints, grid);
                if (!picked) {
                    queueWaitAndEndTurn(unit, context);
                    return;
                }
                ctx.defensePointTargetId = picked.id;
                ctx.aiState = 'default_siegeDefendPoint';
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const retrigger = unit.pathfindingRetriggerOffset ?? DEFAULT_PATH_RETRIGGER;
            const onRetriggerTick = retrigger > 0 && context.gameTick % retrigger === 0;
            const shouldRecalcPathToDefend =
                (unit.pathInvalidated || !unit.movement?.path?.length || onRetriggerTick) &&
                !ctx.targetUnitId &&
                unit.activeAbilities.length === 0;
            if (shouldRecalcPathToDefend && terrainManager && grid) {
                const unitGrid = grid.worldToGrid(unit.x, unit.y);
                const path = context.findGridPathForUnit(
                    unit,
                    unitGrid.col,
                    unitGrid.row,
                    currentDefendPoint.col,
                    currentDefendPoint.row,
                );
                if (path && path.length > 0) {
                    unit.setMovement(path, undefined, context.gameTick);
                }
            }

            const perceptionRange = getPerceptionRange(unit.characterId);
            const enemies = findEnemies(unit, context.getUnits());
            const inPerceptionAndLOS = getEnemiesInPerceptionAndLOS(
                unit,
                enemies,
                perceptionRange,
                context.hasLineOfSight.bind(context),
            );

            if (inPerceptionAndLOS.length > 0) {
                ctx.corruptingTargetId = undefined;
                ctx.corruptingStartedAt = undefined;
                const combatTarget = inPerceptionAndLOS[0]!;
                ctx.targetUnitId = combatTarget.id;
                if (unit.aiSettings && terrainManager) {
                    applyAIMovementToUnit(unit, combatTarget, {
                        findGridPath: (fc, fr, tc, tr) => context.findGridPathForUnit(unit, fc, fr, tc, tr),
                        worldToGrid: grid!.worldToGrid.bind(grid!),
                        gameTick: context.gameTick,
                        worldWidth: context.WORLD_WIDTH,
                        worldHeight: context.WORLD_HEIGHT,
                    });
                }
                if (tryQueueAbilityOrder(unit, context, inPerceptionAndLOS)) return;
                context.emitTurnEnd(unit.id);
                return;
            }

            if (grid) {
                const unitGrid = grid.worldToGrid(unit.x, unit.y);
                const atDefendPoint =
                    Math.max(
                        Math.abs(unitGrid.col - currentDefendPoint.col),
                        Math.abs(unitGrid.row - currentDefendPoint.row),
                    ) <= 1;
                if (atDefendPoint && currentDefendPoint.destructible) {
                    ctx.targetUnitId = undefined;
                    ctx.defensePointTargetId = currentDefendPoint.id;
                    ctx.corruptingTargetId = currentDefendPoint.id;
                    ctx.corruptingStartedAt = context.gameTime;
                    unit.clearMovement();
                    queueWaitAndEndTurn(unit, context);
                    return;
                }
            }

            ctx.targetUnitId = undefined;
            ctx.corruptingTargetId = undefined;
            ctx.corruptingStartedAt = undefined;
            queueWaitAndEndTurn(unit, context);
        },
        onPathfindingRetrigger(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as DefaultAITreeContext;
            const defendPoints = context.getAliveDefendPoints();
            if (defendPoints.length === 0) return;
            if (ctx.targetUnitId || unit.activeAbilities.length > 0) return;
            const targetTile = getDefendPointFromContext(unit, defendPoints);
            if (!targetTile || !context.terrainManager?.grid) return;
            const grid = context.terrainManager.grid;
            const unitGrid = grid.worldToGrid(unit.x, unit.y);
            const path = context.findGridPathForUnit(
                unit,
                unitGrid.col,
                unitGrid.row,
                targetTile.col,
                targetTile.row,
            );
            if (path && path.length > 0) {
                unit.setMovement(path, undefined, context.gameTick);
            }
        },
    },
    edges: [
        {
            targetNodeId: 'default_idle',
            evaluate(unit: Unit, context: AIContext): boolean {
                if (context.getAliveDefendPoints().length === 0) {
                    unit.clearMovement();
                    const ctx = unit.aiContext as DefaultAITreeContext;
                    ctx.defensePointTargetId = undefined;
                    ctx.targetUnitId = undefined;
                    return true;
                }
                return false;
            },
        },
    ],
};
