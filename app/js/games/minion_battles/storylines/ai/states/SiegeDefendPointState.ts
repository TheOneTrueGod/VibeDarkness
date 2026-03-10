/**
 * SiegeDefendPointState – Move to defend point, corrupt when close; occasionally scan for hostiles and attack.
 */

import type { Unit } from '../../../objects/Unit';
import type { AIContext } from '../types';
import {
    findEnemies,
    getDefendPointFromContext,
    getEnemiesInPerceptionAndLOS,
    applyAIMovementToUnit,
    tryQueueAbilityOrder,
    queueWaitAndEndTurn,
} from '../utils';
import { getPerceptionRange } from '../../../engine/unitDef';
import { AIState } from './AIState';
import type { SerializedAIState } from './AIState';
import { IdleState } from './IdleState';

const DEFAULT_PATH_RETRIGGER = 50;

export interface SiegeDefendPointStateParams {
    defendPointId: string;
}

export class SiegeDefendPointState extends AIState {
    readonly stateId = 'siegeDefendPoint' as const;
    readonly defendPointId: string;

    constructor(params: SiegeDefendPointStateParams) {
        super();
        this.defendPointId = params.defendPointId;
    }

    executeTurn(unit: Unit, context: AIContext): void {
        const defendPoints = context.getAliveDefendPoints();
        const terrainManager = context.terrainManager;
        const grid = terrainManager?.grid ?? null;

        if (defendPoints.length === 0) {
            unit.clearMovement();
            unit.aiContext.defensePointTargetId = undefined;
            unit.aiContext.aiTargetUnitId = undefined;
            this.setState(unit, new IdleState());
            context.emitTurnEnd(unit.id);
            return;
        }

        unit.aiContext.defensePointTargetId = this.defendPointId;
        const currentDefendPoint = getDefendPointFromContext(unit, defendPoints);
        if (!currentDefendPoint) {
            const picked = defendPoints.find((t) => t.id === this.defendPointId) ?? defendPoints[0]!;
            unit.aiContext.defensePointTargetId = picked.id;
            this.setState(unit, new SiegeDefendPointState({ defendPointId: picked.id }));
            queueWaitAndEndTurn(unit, context);
            return;
        }

        const retrigger = unit.pathfindingRetriggerOffset ?? DEFAULT_PATH_RETRIGGER;
        const onRetriggerTick = retrigger > 0 && context.gameTick % retrigger === 0;
        const shouldRecalcPathToDefend =
            (unit.pathInvalidated || !unit.movement?.path?.length || onRetriggerTick) &&
            !unit.aiContext.aiTargetUnitId &&
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
            unit.aiContext.corruptingTargetId = undefined;
            unit.aiContext.corruptingStartedAt = undefined;
            const combatTarget = inPerceptionAndLOS[0]!;
            unit.aiContext.aiTargetUnitId = combatTarget.id;
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
                unit.aiContext.aiTargetUnitId = undefined;
                unit.aiContext.defensePointTargetId = currentDefendPoint.id;
                if (!unit.aiContext.corruptingTargetId || unit.aiContext.corruptingTargetId !== currentDefendPoint.id) {
                    unit.aiContext.corruptingTargetId = currentDefendPoint.id;
                    unit.aiContext.corruptingStartedAt = context.gameTime;
                }
                unit.clearMovement();
                queueWaitAndEndTurn(unit, context);
                return;
            }
        }

        unit.aiContext.aiTargetUnitId = undefined;
        unit.aiContext.corruptingTargetId = undefined;
        unit.aiContext.corruptingStartedAt = undefined;
        queueWaitAndEndTurn(unit, context);
    }

    onPathfindingRetrigger(unit: Unit, context: AIContext): void {
        const defendPoints = context.getAliveDefendPoints();
        if (defendPoints.length === 0) return;
        if (unit.aiContext.aiTargetUnitId || unit.activeAbilities.length > 0) return;
        const targetTile = defendPoints.find((t) => t.id === this.defendPointId);
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
    }

    toJSON(): SerializedAIState {
        return { stateId: 'siegeDefendPoint', defendPointId: this.defendPointId };
    }

    static fromJSON(data: SerializedAIState): SiegeDefendPointState {
        return new SiegeDefendPointState({
            defendPointId: (data.defendPointId as string) ?? '',
        });
    }
}
