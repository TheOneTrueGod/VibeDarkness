/**
 * LegacyAIController - Original AI behavior: random enemy target, move to range, use ability.
 * Default when a mission does not define aiController.
 */

import type { Unit } from '../../objects/Unit';
import type { UnitAIController, AIContext } from './types';
import { findEnemies, applyAIMovementToUnit, tryQueueAbilityOrder } from './utils';

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

        // Try to use an ability as soon as a valid target is in range.
        // If none are in range yet, keep chasing without forcing a wait cooldown;
        // the controller will run again next frame while the unit can act.
        if (tryQueueAbilityOrder(unit, context, enemies)) {
            return;
        }
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
