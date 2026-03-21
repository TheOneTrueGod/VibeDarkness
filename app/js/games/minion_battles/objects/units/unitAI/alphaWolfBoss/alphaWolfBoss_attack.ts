/**
 * alphaWolfBoss_attack - Move toward prey, use best ability (by AISettings priority).
 * Alpha wolf: Summon (priority 20) then Claw (priority 10). Dark wolf: Bite.
 */

import type { Unit } from '../../../Unit';
import type { AIContext } from '../types';
import type { AINode } from '../types';
import {
    findEnemies,
    getEnemiesInPerceptionAndLOS,
    applyAIMovementToUnit,
    tryQueueAbilityOrder,
    queueWaitAndEndTurn,
} from '../utils';
import { getPerceptionRange } from '../../../../engine/unitDef';

const TREE_NAME = 'alphaWolfBoss';
type AlphaWolfBossNodeId = 'alphaWolfBoss_idle' | 'alphaWolfBoss_attack';

function getSightRadius(unit: Unit): number {
    return (unit.aiContext?.sightRadius as number | undefined) ?? getPerceptionRange(unit.characterId);
}

function pickOrGetPrey(unit: Unit, context: AIContext): Unit | null {
    const enemies = findEnemies(unit, context.getUnits());
    if (enemies.length === 0) return null;

    const sightRadius = getSightRadius(unit);
    const inSight = getEnemiesInPerceptionAndLOS(
        unit,
        enemies,
        sightRadius,
        context.hasLineOfSight.bind(context),
    );
    if (inSight.length === 0) return null;

    const storedPreyId = unit.aiContext?.preyUnitId as string | undefined;
    const storedPrey = storedPreyId ? context.getUnit(storedPreyId) : null;
    if (storedPrey?.isAlive() && inSight.some((e) => e.id === storedPreyId)) {
        return storedPrey;
    }

    const prey = inSight[context.generateRandomInteger(0, inSight.length - 1)] ?? null;
    if (prey) {
        unit.aiContext = { ...unit.aiContext, preyUnitId: prey.id };
    }
    return prey;
}

export const alphaWolfBoss_attack: AINode<typeof TREE_NAME, AlphaWolfBossNodeId> = {
    nodeId: 'alphaWolfBoss_attack',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const sightRadius = getSightRadius(unit);
            const enemies = findEnemies(unit, context.getUnits());
            const inSight = getEnemiesInPerceptionAndLOS(
                unit,
                enemies,
                sightRadius,
                context.hasLineOfSight.bind(context),
            );

            if (inSight.length === 0) {
                unit.aiContext = { ...unit.aiContext, unitAINodeId: 'alphaWolfBoss_idle' };
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const target =
                unit.characterId === 'alpha_wolf'
                    ? pickOrGetPrey(unit, context)
                    : inSight[0] ?? null;

            if (!target?.isAlive()) {
                unit.aiContext = { ...unit.aiContext, unitAINodeId: 'alphaWolfBoss_idle' };
                queueWaitAndEndTurn(unit, context);
                return;
            }

            if (unit.aiSettings && context.terrainManager) {
                unit.aiContext = { ...unit.aiContext, aiTargetUnitId: target.id };
                applyAIMovementToUnit(unit, target, {
                    findGridPath: (fc, fr, tc, tr) => context.findGridPathForUnit(unit, fc, fr, tc, tr),
                    worldToGrid: context.terrainManager.grid.worldToGrid.bind(context.terrainManager.grid),
                    gameTick: context.gameTick,
                    worldWidth: context.WORLD_WIDTH,
                    worldHeight: context.WORLD_HEIGHT,
                });
            }

            if (tryQueueAbilityOrder(unit, context, inSight)) return;
            queueWaitAndEndTurn(unit, context);
        },
        onPathfindingRetrigger(unit: Unit, context: AIContext): void {
            const sightRadius = getSightRadius(unit);
            const enemies = findEnemies(unit, context.getUnits());
            const inSight = getEnemiesInPerceptionAndLOS(
                unit,
                enemies,
                sightRadius,
                context.hasLineOfSight.bind(context),
            );
            const target =
                unit.characterId === 'alpha_wolf'
                    ? pickOrGetPrey(unit, context)
                    : inSight[0] ?? null;
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
            targetNodeId: 'alphaWolfBoss_idle',
            evaluate(unit: Unit, context: AIContext): boolean {
                const sightRadius = getSightRadius(unit);
                const enemies = findEnemies(unit, context.getUnits());
                const inSight = getEnemiesInPerceptionAndLOS(
                    unit,
                    enemies,
                    sightRadius,
                    context.hasLineOfSight.bind(context),
                );
                return inSight.length === 0;
            },
        },
    ],
};
