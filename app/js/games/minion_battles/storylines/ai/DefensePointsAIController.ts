/**
 * DefensePointsAIController - AI that moves toward DefendPoints and engages hostiles in perception + LOS.
 *
 * Turn flow:
 * 1. No defend points → clear state, wait, end turn.
 * 2. Resolve defense point target (reuse or pick closest).
 * 3. Recalculate path to target when needed (no path or retrigger tick).
 * 4. Get enemies in perception + LOS (sorted by distance).
 * 5. If hostiles present: set combat target, apply movement toward them, try to use an ability; else wait.
 */

import type { Unit } from '../../objects/Unit';
import type { UnitAIController, AIContext } from './types';
import {
	findEnemies,
	getOrPickClosestDefendPoint,
	getDefendPointFromContext,
	getEnemiesInPerceptionAndLOS,
	applyAIMovementToUnit,
	tryQueueAbilityOrder,
	queueWaitAndEndTurn,
} from './utils';
import { getPerceptionRange } from '../../engine/unitDef';

const DEFAULT_PATH_RETRIGGER = 50;

export const DefensePointsAIController: UnitAIController = {
	executeTurn(unit: Unit, context: AIContext): void {
		const defendPoints = context.getAliveDefendPoints();
		const terrainManager = context.terrainManager;
		const grid = terrainManager?.grid ?? null;

		// Step 1: No DefendPoints → stand still, clear state, wait.
		if (defendPoints.length === 0) {
			unit.clearMovement();
			unit.aiContext.defensePointTargetId = undefined;
			unit.aiContext.aiTargetUnitId = undefined;
			queueWaitAndEndTurn(unit, context);
			return;
		}

		// Step 2: Ensure we have a valid defend point target id (closest alive) when any exist.
		const currentDefendPoint = getDefendPointFromContext(unit, defendPoints);
		if (!currentDefendPoint) {
			const picked = getOrPickClosestDefendPoint(unit, defendPoints, grid);
			if (picked) {
				unit.aiContext.defensePointTargetId = picked.id;
			}
			// After picking a defend point this turn, end with a wait.
			queueWaitAndEndTurn(unit, context);
			return;
		}

		// Step 3: Recalculate path to defend point when needed
		const retrigger = unit.pathfindingRetriggerOffset ?? DEFAULT_PATH_RETRIGGER;
		const onRetriggerTick = retrigger > 0 && context.gameTick % retrigger === 0;
		const shouldRecalcPathToDefend =
			(unit.pathInvalidated || !unit.movement?.path?.length || onRetriggerTick) &&
			!unit.aiContext.aiTargetUnitId &&
			unit.activeAbilities.length === 0;
		if (shouldRecalcPathToDefend && terrainManager && grid) {
			const unitGrid = grid.worldToGrid(unit.x, unit.y);
			const path = terrainManager.findGridPath(
				unitGrid.col,
				unitGrid.row,
				currentDefendPoint.col,
				currentDefendPoint.row,
			);
			if (path && path.length > 0) {
				unit.setMovement(path, undefined, context.gameTick);
			}
		}

		// Step 4: Hostiles in perception + LOS (closest first)
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
					findGridPath: terrainManager.findGridPath.bind(terrainManager),
					worldToGrid: grid!.worldToGrid.bind(grid!),
					gameTick: context.gameTick,
					worldWidth: context.WORLD_WIDTH,
					worldHeight: context.WORLD_HEIGHT,
				});
			}

			// Try to use an ability as soon as a valid target is in range.
			// If none are in range yet, keep chasing without forcing a wait cooldown;
			// the controller will run again next frame while the unit can act.
			if (tryQueueAbilityOrder(unit, context, inPerceptionAndLOS)) {
				return;
			}
			return;
		}

		// Step 4b: No hostiles — if at a destructible defend point, start or continue corrupting.
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

		// Step 5: No hostiles and not corrupting → clear combat/corrupting target, wait.
		unit.aiContext.aiTargetUnitId = undefined;
		unit.aiContext.corruptingTargetId = undefined;
		unit.aiContext.corruptingStartedAt = undefined;
		queueWaitAndEndTurn(unit, context);
	},

	onPathfindingRetrigger(unit: Unit, context: AIContext): void {
		const defendPoints = context.getAliveDefendPoints();
		if (defendPoints.length === 0) return;
		// Do not refresh defend-point path while chasing a target or executing an ability.
		if (unit.aiContext.aiTargetUnitId || unit.activeAbilities.length > 0) return;

		const targetTile = unit.aiContext.defensePointTargetId
			? defendPoints.find((t) => t.id === unit.aiContext.defensePointTargetId)
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
