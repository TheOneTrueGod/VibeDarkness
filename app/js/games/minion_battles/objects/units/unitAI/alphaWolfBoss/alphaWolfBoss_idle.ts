/**
 * alphaWolfBoss_idle - Wait when no enemies in sight. Transition to attack when enemies visible.
 */

import type { Unit } from '../../../Unit';
import type { AIContext } from '../types';
import type { AINode } from '../types';
import { findEnemies, getEnemiesInPerceptionAndLOS, queueWaitAndEndTurn } from '../utils';
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

export const alphaWolfBoss_idle: AINode<typeof TREE_NAME, AlphaWolfBossNodeId> = {
    nodeId: 'alphaWolfBoss_idle',
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

            if (inSight.length > 0) {
                const prey = pickOrGetPrey(unit, context);
                if (prey) {
                    unit.aiContext = { ...unit.aiContext, unitAINodeId: 'alphaWolfBoss_attack', aiTargetUnitId: prey.id };
                }
            }
            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [
        {
            targetNodeId: 'alphaWolfBoss_attack',
            evaluate(unit: Unit, context: AIContext): boolean {
                const sightRadius = getSightRadius(unit);
                const enemies = findEnemies(unit, context.getUnits());
                const inSight = getEnemiesInPerceptionAndLOS(
                    unit,
                    enemies,
                    sightRadius,
                    context.hasLineOfSight.bind(context),
                );
                if (inSight.length === 0) return false;
                const prey = pickOrGetPrey(unit, context);
                if (prey) {
                    unit.aiContext = { ...unit.aiContext, aiTargetUnitId: prey.id };
                    return true;
                }
                return false;
            },
        },
    ],
};
