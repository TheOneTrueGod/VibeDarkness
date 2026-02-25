/**
 * LegacyAIController - Original AI behavior: random enemy target, move to range, use ability.
 * Default when a mission does not define aiController.
 */

import type { Unit } from '../../objects/Unit';
import type { UnitAIController, AIContext } from './types';
import { findEnemies, findAIAbilityTarget, buildResolvedTargets, applyAIMovementToUnit } from './utils';
import { getAbility } from '../../abilities/AbilityRegistry';

export const LegacyAIController: UnitAIController = {
    executeTurn(unit: Unit, context: AIContext): void {
        const enemies = findEnemies(unit, context.getUnits());
        if (enemies.length === 0) {
            unit.startCooldown(1);
            context.emitTurnEnd(unit.id);
            return;
        }

        const moveTarget = enemies[context.generateRandomInteger(0, enemies.length - 1)]!;
        if (unit.aiSettings && context.terrainManager) {
            applyAIMovementToUnit(unit, moveTarget, {
                findGridPath: context.terrainManager.findGridPath.bind(context.terrainManager),
                worldToGrid: context.terrainManager.grid.worldToGrid.bind(context.terrainManager.grid),
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
                enemies,
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

        context.queueOrder(context.gameTick, { unitId: unit.id, abilityId: 'wait', targets: [] });
        context.emitTurnEnd(unit.id);
    },

    onPathfindingRetrigger(unit: Unit, context: AIContext): void {
        const target = unit.movement?.targetUnitId ? context.getUnit(unit.movement.targetUnitId) : undefined;
        if (!target?.isAlive() || !unit.aiSettings || !context.terrainManager) return;
        applyAIMovementToUnit(unit, target, {
            findGridPath: context.terrainManager.findGridPath.bind(context.terrainManager),
            worldToGrid: context.terrainManager.grid.worldToGrid.bind(context.terrainManager.grid),
            gameTick: context.gameTick,
            worldWidth: context.WORLD_WIDTH,
            worldHeight: context.WORLD_HEIGHT,
        });
    },
};
