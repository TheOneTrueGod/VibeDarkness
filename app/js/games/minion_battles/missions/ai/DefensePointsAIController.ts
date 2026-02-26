/**
 * DefensePointsAIController - AI that moves toward DefendPoints and engages hostiles in perception + LOS.
 */

import type { Unit } from '../../objects/Unit';
import type { UnitAIController, AIContext } from './types';
import type { SpecialTile } from '../../objects/SpecialTile';
import { findEnemies, findAIAbilityTarget, buildResolvedTargets, applyAIMovementToUnit } from './utils';
import { getAbility } from '../../abilities/AbilityRegistry';
import { getPerceptionRange } from '../../engine/unitDef';

const DEFAULT_PATH_RETRIGGER = 50;

function distance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

export const DefensePointsAIController: UnitAIController = {
    executeTurn(unit: Unit, context: AIContext): void {
        const defendPoints = context.getAliveDefendPoints();
        if (defendPoints.length === 0) {
            unit.clearMovement();
            unit.defensePointTarget = undefined;
            unit.aiTargetUnitId = undefined;
            context.queueOrder(context.gameTick, { unitId: unit.id, abilityId: 'wait', targets: [] });
            context.emitTurnEnd(unit.id);
            return;
        }

        const tm = context.terrainManager;
        const grid = tm?.grid;

        // Ensure we have a valid defense point target
        let targetTile = unit.defensePointTarget
            ? defendPoints.find((t) => t.id === unit.defensePointTarget)
            : undefined;
        if (!targetTile) {
            const unitGrid = grid?.worldToGrid(unit.x, unit.y);
            if (!grid || !unitGrid) {
                context.queueOrder(context.gameTick, { unitId: unit.id, abilityId: 'wait', targets: [] });
                context.emitTurnEnd(unit.id);
                return;
            }
            let best: SpecialTile | null = null;
            let bestDist = Infinity;
            for (const tile of defendPoints) {
                const world = grid.gridToWorld(tile.col, tile.row);
                const d = distance(unit.x, unit.y, world.x, world.y);
                if (d < bestDist) {
                    bestDist = d;
                    best = tile;
                }
            }
            targetTile = best ?? defendPoints[0]!;
            unit.defensePointTarget = targetTile.id;
        }

        const retrigger = unit.pathfindingRetriggerOffset ?? DEFAULT_PATH_RETRIGGER;
        const shouldRecalcPath =
            !unit.movement?.path?.length || context.gameTick % retrigger === 0;

        if (shouldRecalcPath && tm && grid) {
            const unitGrid = grid.worldToGrid(unit.x, unit.y);
            const path = tm.findGridPath(unitGrid.col, unitGrid.row, targetTile.col, targetTile.row);
            if (path && path.length > 0) {
                unit.setMovement(path, undefined, context.gameTick);
            }
        }

        const perceptionRange = getPerceptionRange(unit.characterId);
        const enemies = findEnemies(unit, context.getUnits());
        const inPerceptionAndLOS = enemies.filter((e) => {
            const d = distance(unit.x, unit.y, e.x, e.y);
            if (d > perceptionRange) return false;
            return context.hasLineOfSight(unit.x, unit.y, e.x, e.y);
        });

        if (inPerceptionAndLOS.length > 0) {
            inPerceptionAndLOS.sort(
                (a, b) =>
                    distance(unit.x, unit.y, a.x, a.y) - distance(unit.x, unit.y, b.x, b.y),
            );
            const combatTarget = inPerceptionAndLOS[0]!;
            unit.aiTargetUnitId = combatTarget.id;

            if (unit.aiSettings && tm) {
                applyAIMovementToUnit(unit, combatTarget, {
                    findGridPath: tm.findGridPath.bind(tm),
                    worldToGrid: grid!.worldToGrid.bind(grid!),
                    gameTick: context.gameTick,
                    worldWidth: context.WORLD_WIDTH,
                    worldHeight: context.WORLD_HEIGHT,
                });
            }

            for (const abilityId of unit.abilities) {
                const ability = getAbility(abilityId);
                if (!ability) continue;

                const validTarget = findAIAbilityTarget(
                    unit,
                    ability,
                    inPerceptionAndLOS,
                    (min, max) => context.generateRandomInteger(min, max),
                );
                if (!validTarget) continue;

                const resolvedTargets = buildResolvedTargets(ability, validTarget);
                context.queueOrder(context.gameTick, {
                    unitId: unit.id,
                    abilityId: ability.id,
                    targets: resolvedTargets,
                    movePath: unit.movement?.path ? [...unit.movement.path] : undefined,
                });
                context.emitTurnEnd(unit.id);
                return;
            }
        } else {
            unit.aiTargetUnitId = undefined;
        }

        context.queueOrder(context.gameTick, { unitId: unit.id, abilityId: 'wait', targets: [] });
        context.emitTurnEnd(unit.id);
    },

    onPathfindingRetrigger(unit: Unit, context: AIContext): void {
        const defendPoints = context.getAliveDefendPoints();
        if (defendPoints.length === 0) return;

        const targetTile = unit.defensePointTarget
            ? defendPoints.find((t) => t.id === unit.defensePointTarget)
            : undefined;
        if (!targetTile || !context.terrainManager?.grid) return;

        const grid = context.terrainManager.grid;
        const unitGrid = grid.worldToGrid(unit.x, unit.y);
        const path = context.terrainManager.findGridPath(
            unitGrid.col,
            unitGrid.row,
            targetTile.col,
            targetTile.row,
        );
        if (path && path.length > 0) {
            unit.setMovement(path, undefined, context.gameTick);
        }
    },
};
