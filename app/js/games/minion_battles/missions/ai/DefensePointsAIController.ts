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

		// Step 1: Check defend points and ensure a valid target id when any exist
		if (defendPoints.length === 0) {
			if (unit.aiContext.defensePointTargetId) {
				unit.clearMovement();
				unit.aiContext.defensePointTargetId = undefined;
			}
		} else {
			const current = getDefendPointFromContext(unit, defendPoints);
			if (!current) {
				const picked = getOrPickClosestDefendPoint(unit, defendPoints, grid);
				if (picked) {
					unit.aiContext.defensePointTargetId = picked.id;
				}
			}
		}

		// Step 2: Recalculate path to target when needed
		const retrigger = unit.pathfindingRetriggerOffset ?? DEFAULT_PATH_RETRIGGER;
		const targetTile = getDefendPointFromContext(unit, defendPoints);
		const onRetriggerTick = context.gameTick % retrigger === 0
		const shouldRecalcPath =
			!unit.movement?.path?.length || onRetriggerTick
		if (shouldRecalcPath && terrainManager && grid && targetTile) {
			const unitGrid = grid.worldToGrid(unit.x, unit.y);
			const path = terrainManager.findGridPath(unitGrid.col, unitGrid.row, targetTile.col, targetTile.row);
			if (path && path.length > 0) {
				unit.setMovement(path, undefined, context.gameTick);
			}
		}

		// Step 3: Enemies in perception + LOS (closest first)
		const perceptionRange = getPerceptionRange(unit.characterId);
		if (!unit.aiContext.aiTargetUnitId && onRetriggerTick) {
			const enemies = findEnemies(unit, context.getUnits());
			const inPerceptionAndLOS = getEnemiesInPerceptionAndLOS(
				unit,
				enemies,
				perceptionRange,
				context.hasLineOfSight.bind(context),
			);
			if (inPerceptionAndLOS.length > 0) {
				unit.aiContext.aiTargetUnitId = inPerceptionAndLOS[0]!.id;
			}
		}

		// Step 4: Combat or move or wait
		const targetUnit = unit.aiContext.aiTargetUnitId ? context.getUnit(unit.aiContext.aiTargetUnitId) : undefined;
		if (targetUnit && unit.aiSettings && terrainManager) {
			applyAIMovementToUnit(unit, targetUnit, {
				findGridPath: terrainManager.findGridPath.bind(terrainManager),
				worldToGrid: grid!.worldToGrid.bind(grid!),
				gameTick: context.gameTick,
				worldWidth: context.WORLD_WIDTH,
				worldHeight: context.WORLD_HEIGHT,
			});
			tryQueueAbilityOrder(unit, context, targetUnit ? [targetUnit] : [])
		} else if (unit.aiContext.defensePointTargetId) {
			// Do nothing, we're moving toward the defend point
		} else {
			queueWaitAndEndTurn(unit, context);
		}
	},

	onPathfindingRetrigger(unit: Unit, context: AIContext): void {
		const defendPoints = context.getAliveDefendPoints();
		if (defendPoints.length === 0) return;

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
