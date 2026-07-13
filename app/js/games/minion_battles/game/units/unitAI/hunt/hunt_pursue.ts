/**
 * hunt_pursue - Move toward and attack the current target.
 *
 * Trusts the unit's tactical plan for target identity. The plan is set by
 * hunt_seek and held until it expires or an interrupt fires (e.g. target_died).
 * Does not rescan for a closer target mid-pursuit — if the plan expires,
 * the unit returns to hunt_seek which will acquire a fresh target.
 * Does not require line-of-sight to keep a target — pathfinds relentlessly.
 * Movement and the locked-target ability pool both use only the pursuit target; the full
 * `enemies` scan is passed through solely for `candidateScope: 'anyNearby'` abilities (e.g. a
 * reactive defensive AoE) so they can trigger off any nearby enemy, not just the one being chased.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { HuntAITreeContext, HuntNodeId } from './context';
import { findEnemies, applyAIMovementToUnit, tryQueueAbilityOrder } from '../utils';

export const hunt_pursue: AINode<'hunt', HuntNodeId> = {
    nodeId: 'hunt_pursue',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as HuntAITreeContext;

            // Resolve the current target from the tactical plan (primary) or ctx fallback.
            const planTargetId = unit.tacticalPlan?.data.targetUnitId ?? null;
            const targetId = planTargetId ?? ctx.targetUnitId ?? null;
            const target = targetId ? context.getUnit(targetId) : null;

            if (!target?.isAlive()) {
                // Target gone — clear plan and return to seek for a fresh scan.
                unit.tacticalPlan = null;
                ctx.aiState = 'hunt_seek';
                ctx.targetUnitId = undefined;
                return;
            }

            // Keep ctx in sync with the plan so other callers see the right id.
            ctx.targetUnitId = target.id;

            if (unit.aiSettings && context.terrainManager) {
                applyAIMovementToUnit(unit, target, {
                    findGridPath: (fc, fr, tc, tr) => context.findGridPathForUnit(unit, fc, fr, tc, tr),
                    worldToGrid: context.terrainManager.grid.worldToGrid.bind(context.terrainManager.grid),
                    gameTick: context.gameTick,
                    worldWidth: context.WORLD_WIDTH,
                    worldHeight: context.WORLD_HEIGHT,
                });
            }

            const enemies = findEnemies(unit, context.getUnits());
            const targetInEnemies = enemies.filter((e) => e.id === ctx.targetUnitId);
            if (tryQueueAbilityOrder(unit, context, targetInEnemies, enemies)) return;

            context.emitTurnEnd(unit.id);
        },

        onPathfindingRetrigger(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as HuntAITreeContext;
            const target = ctx.targetUnitId ? context.getUnit(ctx.targetUnitId) : null;
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
            targetNodeId: 'hunt_seek',
            evaluate(unit: Unit, context: AIContext): boolean {
                const ctx = unit.aiContext as HuntAITreeContext;
                const target = ctx.targetUnitId ? context.getUnit(ctx.targetUnitId) : null;
                return !target?.isAlive();
            },
        },
    ],
};
