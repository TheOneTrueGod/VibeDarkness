/**
 * default_siegeDefendPoint - Move to defend point, corrupt when close; engage hostiles.
 */

import type { Unit } from '../../Unit';
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
import { getPerceptionRange } from '../../unit_defs/unitDef';

export const default_siegeDefendPoint: AINode<'default', DefaultNodeId> = {
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

            // Move to defend point when not engaged in combat
            if (!ctx.targetUnitId && unit.activeAbilities.length === 0 && grid) {
                const unitGrid = grid.worldToGrid(unit.x, unit.y);
                const atDefendPoint =
                    Math.max(
                        Math.abs(unitGrid.col - currentDefendPoint.col),
                        Math.abs(unitGrid.row - currentDefendPoint.row),
                    ) <= 1;
                if (!atDefendPoint) {
                    context.nav.moveToCell(unit, currentDefendPoint.col, currentDefendPoint.row);
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
                applyAIMovementToUnit(unit, combatTarget, context);
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
