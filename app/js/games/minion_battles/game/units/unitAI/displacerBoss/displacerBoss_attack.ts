/**
 * displacerBoss_attack - Flit around the nearest player at ~70% bolt range without pausing (it only
 * stands still while casting), and cast the best eligible ability. Scheduling lives on the abilities:
 * Light Eater (second or third quarter, every other round, needs a light) > Displacer Bolt (up to 4 per
 * round). Phantom Decoy has no schedule: it is Light Eater's `followUp`, and the spirit's HP phases recover
 * both (granted casts, which outrank everything; see `unitAI/grantedCasts.ts`).
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { DisplacerBossAITreeContext, DisplacerBossNodeId } from './context';
import { tryQueueAbilityOrder } from '../utils';
import { applyKiteMovement } from '../displacer/displacerKite';
import { getEnemiesInRangeNearestFirst, getVisibleEnemiesNearestFirst } from '../displacer/displacerPerception';

function sight(unit: Unit): number | undefined {
    return (unit.aiContext as DisplacerBossAITreeContext).sightRadius;
}

export const displacerBoss_attack: AINode<'displacerBoss', DisplacerBossNodeId> = {
    nodeId: 'displacerBoss_attack',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as DisplacerBossAITreeContext;
            const inSight = getVisibleEnemiesNearestFirst(unit, context, sight(unit));
            // Keep hunting the nearest player even when cover blocks the view; only casting needs sight.
            const target = inSight[0] ?? getEnemiesInRangeNearestFirst(unit, context, sight(unit))[0];
            if (!target) {
                ctx.aiState = 'displacerBoss_idle';
                return;
            }
            ctx.targetUnitId = target.id;

            applyKiteMovement(unit, target, context, { continuous: true });
            // Most abilities need a player in sight; `candidateScope: 'anyNearby'` ones (Phantom Decoy) may target
            // any living player at any range, so they get every enemy regardless of distance or cover.
            const everyEnemy = getEnemiesInRangeNearestFirst(unit, context, Number.POSITIVE_INFINITY);
            if (tryQueueAbilityOrder(unit, context, inSight, everyEnemy)) return;
            context.emitTurnEnd(unit.id);
        },
    },
    edges: [
        {
            targetNodeId: 'displacerBoss_idle',
            evaluate(unit: Unit, context: AIContext): boolean {
                return getEnemiesInRangeNearestFirst(unit, context, sight(unit)).length === 0;
            },
        },
    ],
};
