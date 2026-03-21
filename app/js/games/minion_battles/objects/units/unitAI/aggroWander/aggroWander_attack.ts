/**
 * aggroWander_attack - Chase and attack a spotted enemy.
 *
 * Periodically rescans for the nearest enemy and switches targets.
 * Moves toward the target and uses the best available ability.
 * Returns to wander when the target dies or leaves line of sight.
 */

import type { Unit } from '../../../Unit';
import type { AIContext } from '../types';
import type { AINode } from '../types';
import {
    findEnemies,
    getEnemiesInPerceptionAndLOS,
    applyAIMovementToUnit,
    tryQueueAbilityOrder,
} from '../utils';
import { getPerceptionRange } from '../../../../engine/unitDef';

const TREE_NAME = 'aggroWander';
type AggroWanderNodeId = 'aggroWander_wander' | 'aggroWander_attack';

const ROUND_DURATION = 10;

/** How often (in rounds) the unit rescans for the nearest enemy while attacking. */
const RESCAN_INTERVAL_ROUNDS = 0.25;

export const aggroWander_attack: AINode<typeof TREE_NAME, AggroWanderNodeId> = {
    nodeId: 'aggroWander_attack',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ai = unit.aiContext;
            const lastScan = ai.aggroWanderLastScanTime ?? -Infinity;

            if (context.gameTime - lastScan >= RESCAN_INTERVAL_ROUNDS * ROUND_DURATION) {
                ai.aggroWanderLastScanTime = context.gameTime;
                const perceptionRange = getPerceptionRange(unit.characterId);
                const enemies = findEnemies(unit, context.getUnits());
                const inSight = getEnemiesInPerceptionAndLOS(
                    unit,
                    enemies,
                    perceptionRange,
                    context.hasLineOfSight.bind(context),
                );
                if (inSight.length > 0) {
                    ai.aiTargetUnitId = inSight[0]!.id;
                }
            }

            const targetId = ai.aiTargetUnitId;
            const target = targetId ? context.getUnit(targetId) : null;

            if (!target?.isAlive() || !hasLOS(unit, target, context)) {
                unit.aiContext = {
                    ...unit.aiContext,
                    unitAINodeId: 'aggroWander_wander',
                    aiTargetUnitId: undefined,
                };
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

            const enemies = findEnemies(unit, context.getUnits());
            const targetInEnemies = enemies.filter((e) => e.id === targetId);
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
            targetNodeId: 'aggroWander_wander',
            evaluate(unit: Unit, context: AIContext): boolean {
                const targetId = unit.aiContext?.aiTargetUnitId;
                const target = targetId ? context.getUnit(targetId) : null;
                if (!target?.isAlive()) return true;
                return !hasLOS(unit, target, context);
            },
        },
    ],
};

function hasLOS(unit: Unit, target: Unit, context: AIContext): boolean {
    const perceptionRange = getPerceptionRange(unit.characterId);
    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    if (Math.sqrt(dx * dx + dy * dy) > perceptionRange) return false;
    return context.hasLineOfSight(unit.x, unit.y, target.x, target.y);
}
